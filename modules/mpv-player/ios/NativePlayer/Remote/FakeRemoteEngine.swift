import Foundation

struct FakeRemoteItem: Equatable {
	let id: String
	let durationSec: Double
}

/// A TV that is not there, for the remote chrome's tests and the debug probe: a list of items on a clock
/// that moves one second per progress step, with the Cast engine's transport and queue faces. It has no
/// rendering face, so the chrome reads it as remote. Main thread only, like the Cast engine; after
/// `shutdown()` it announces nothing. The simulate calls play the scenes of a real TV the remote screen
/// has to follow: a suspended session, its resume, a stop from the TV's own remote. A load plays the items it
/// asks for, `PlayerConstants.fakeRemoteItemSec` each, and one that starts with `PlayerConstants.fakeRemoteFailId`
/// fails as a receiver that cannot play it.
final class FakeRemoteEngine: RemoteEngine {
	/// Runs the closure after a delay in milliseconds and hands back its cancel, as `CastEngine.Delivery`.
	typealias Delivery = (Double, @escaping () -> Void) -> (() -> Void)

	static let defaultItems = (1...3).map {
		FakeRemoteItem(id: "fake-episode-\($0)", durationSec: PlayerConstants.fakeRemoteItemSec)
	}
	static let stoppedError = "The fake TV was let go of"
	private static let failMessage = #"{"type":"playbackerror","message":"NotAllowed"}"#

	weak var delegate: PlayerEngineDelegate?
	var onStateChanged: (() -> Void)?

	private let deliver: Delivery
	private var items: [FakeRemoteItem]
	private var index = 0
	private var position = 0.0
	private var paused = true
	private var loaded = false
	private var stopped = false
	private var cancelLoad: (() -> Void)?
	private var pendingCompletion: ((CastLoadResult) -> Void)?
	private var cancelTick: (() -> Void)?
	private var volume = 0.5
	private var suspended = false
	private var stoppedFromReceiver = false
	private var heardState: [AnyHashable?]?

	init(deliver: @escaping Delivery, items: [FakeRemoteItem] = FakeRemoteEngine.defaultItems) {
		self.deliver = deliver
		self.items = items
	}

	private var current: FakeRemoteItem? { index < items.count ? items[index] : nil }

	var intendedPlayState: Bool { !paused }
	var canChangeSpeed: Bool { false }
	var currentItemId: String? { loaded ? current?.id : nil }
	var targetVolume: Double? { volume }

	var phase: RemotePhase {
		guard loaded else { return cancelLoad != nil ? .loading : .none }
		guard current != nil else { return .ended }
		if stoppedFromReceiver { return .stopped }
		return paused ? .paused : .playing
	}
	var reconnecting: Bool { suspended }
	var queueItemIds: [String] { items.map(\.id) }
	var playingIndex: Int { loaded && current != nil ? index : -1 }

	// MARK: - Lifecycle

	func start() throws {
		guard !stopped else { return }
		delegate?.engine(self, didChangeLoading: true)
		cancelLoad = deliver(PlayerConstants.fakeRemoteLoadMs) { [weak self] in
			guard let self else { return }
			self.cancelLoad = nil
			self.loaded = true
			self.delegate?.engine(self, didChangeLoading: false)
			self.delegate?.engine(self, didBecomeReadyToSeek: true)
			self.setPaused(false)
			self.report()
			self.notifyState()
		}
		notifyState()
	}

	func shutdown() {
		stopped = true
		cancelLoad?()
		cancelLoad = nil
		supersedePending()
		stopTicking()
	}

	func destroy() { shutdown() }

	// A remote screen has no stream to load: what plays is the fake's list.
	func loadVideo(config: VideoLoadConfig, force: Bool) {}

	// The fake has no envelope to carry: its TV plays on as it was.
	func useServer(_ server: ReceiverServer) {}
	func reloadCurrentItem(server: ReceiverServer) {}

	func load(server: ReceiverServer, request: ReceiverPlayRequest, completion: @escaping (CastLoadResult) -> Void) {
		guard !stopped else { return completion(.notSent(Self.stoppedError)) }
		// The load before this one, still on its way, is replaced; the TV starts over on this one.
		cancelLoad?()
		supersedePending()
		stopTicking()
		loaded = false
		stoppedFromReceiver = false
		pendingCompletion = completion
		delegate?.engine(self, didChangeLoading: true)
		cancelLoad = deliver(PlayerConstants.fakeRemoteLoadMs) { [weak self] in
			guard let self else { return }
			self.cancelLoad = nil
			self.pendingCompletion = nil
			self.items = request.items.map { FakeRemoteItem(id: $0.id ?? "", durationSec: PlayerConstants.fakeRemoteItemSec) }
			self.delegate?.engine(self, didChangeLoading: false)
			guard request.items.first?.id != PlayerConstants.fakeRemoteFailId else {
				self.notifyState()
				completion(.settled(.failed(.playbackFailed, .unparsed(Self.failMessage))))
				return
			}
			self.index = request.startIndex ?? 0
			self.position = Double(request.startPositionTicks ?? 0) / ReceiverProtocol.ticksPerSecond
			self.loaded = true
			self.delegate?.engine(self, didBecomeReadyToSeek: true)
			if self.paused { self.setPaused(false) } else { self.scheduleTick() }
			self.report()
			self.notifyState()
			completion(.settled(.loaded))
		}
		notifyState()
	}

	private func supersedePending() {
		guard let pending = pendingCompletion else { return }
		pendingCompletion = nil
		pending(.settled(.superseded))
	}

	// MARK: - Transport

	// A TV stopped from its own remote plays again from where it stopped, as the Cast engine resumes it.
	func play() { if loaded && !stopped { resume() } }
	func pause() { if loaded && !stopped { setPaused(true) } }
	func requestPlaying(_ playing: Bool) { playing ? play() : pause() }

	// iOS answers a seek with a progress report at its target.
	func seekTo(position target: Double, exact: Bool) { if move(to: target) { report() } }
	func seekBy(offset: Double) { if move(to: position + offset) { report() } }
	func requestSeek(to position: Double) { seekTo(position: position, exact: false) }
	func requestSeek(by offset: Double) { seekBy(offset: offset) }

	func setSpeed(speed: Double) {}
	func setMute(_ muted: Bool) {}
	func getSpeed() -> Double { 1 }
	func isPaused() -> Bool { paused }
	func getCurrentPosition() -> Double { position }
	func getDuration() -> Double { current?.durationSec ?? 0 }
	func setNowPlayingMetadata(_ metadata: [String: String], artworkHeaders: [String: String]?) {}
	func setSkipIntervals(forward: Double, backward: Double) {}

	// MARK: - Queue

	func skipToNext() { if loaded && !stopped { moveTo(index + 1) } }
	func skipToPrevious() { if loaded && !stopped { moveTo(max(0, index - 1)) } }
	func setTargetVolume(_ level: Double) { volume = min(max(level, 0), 1) }

	// MARK: - Scenes of a real TV

	/// The session suspended (the phone asleep, the app in the background): the TV plays on, unheard.
	func simulateSuspended() {
		guard !stopped, !suspended else { return }
		suspended = true
		delegate?.engine(self, didChangeLoading: true)
		notifyState()
	}

	/// The session back: the TV's state is heard again, where its clock went meanwhile.
	func simulateResumed() {
		guard !stopped, suspended else { return }
		suspended = false
		delegate?.engine(self, didChangeLoading: false)
		report()
		notifyState()
	}

	/// Stopped from the TV's remote before the end: the item stays where it was, the session holds.
	func simulateStoppedFromReceiver() {
		guard loaded, !stopped, current != nil else { return }
		stoppedFromReceiver = true
		setPaused(true)
		notifyState()
	}

	// MARK: - Tracks and audio: the fake has none

	func getSubtitleTracks(completion: @escaping ([[String: Any]]) -> Void) { completion([]) }
	func setSubtitleTrack(_ trackId: Int) {}
	func disableSubtitles() {}
	func getCurrentSubtitleTrack(completion: @escaping (Int) -> Void) { completion(-1) }
	func addSubtitleFile(url: String, select: Bool) {}
	func getAudioTracks(completion: @escaping ([[String: Any]]) -> Void) { completion([]) }
	func setAudioTrack(_ trackId: Int) {}
	func getCurrentAudioTrack(completion: @escaping (Int) -> Void) { completion(-1) }
	func setAudioDelay(_ seconds: Double) {}
	func setVolumeBoost(_ percent: Int) {}
	func setDialogueBoost(_ enabled: Bool) {}
	func setMonoDownmix(_ enabled: Bool) {}

	// MARK: - Clock

	/// Sets the clamped position; false when nothing is loaded or the engine is stopped.
	private func move(to target: Double) -> Bool {
		guard loaded, !stopped else { return false }
		position = min(max(target, 0), getDuration())
		return true
	}

	private func resume() {
		stoppedFromReceiver = false
		setPaused(false)
		notifyState()
	}

	private func setPaused(_ value: Bool) {
		guard paused != value else { return }
		paused = value
		delegate?.engine(self, didChangePause: value)
		if value { stopTicking() } else { scheduleTick() }
		notifyState()
	}

	private func scheduleTick() {
		guard cancelTick == nil, !stopped else { return }
		cancelTick = deliver(CastEngineConstants.progressIntervalMs) { [weak self] in
			self?.cancelTick = nil
			self?.tick()
		}
	}

	private func stopTicking() {
		cancelTick?()
		cancelTick = nil
	}

	private func tick() {
		guard !stopped, !paused else { return }
		position = min(position + CastEngineConstants.progressIntervalMs / 1000, getDuration())
		if position >= getDuration() { moveTo(index + 1) } else { report() }
		if !paused && current != nil { scheduleTick() }
	}

	// Past the last item the list is over: the fake stops its clock and says so, as a TV at the end of a queue.
	private func moveTo(_ next: Int) {
		guard next < items.count else {
			index = items.count
			position = 0
			paused = true
			stopTicking()
			if !suspended { delegate?.engineDidReachEnd(self) }
			notifyState()
			return
		}
		index = next
		position = 0
		report()
		notifyState()
	}

	// A suspended session hears nothing of the TV.
	private func report() {
		guard !suspended else { return }
		delegate?.engine(self, didUpdateProgress: position, duration: getDuration(), cacheSeconds: 0)
	}

	private func notifyState() {
		let state: [AnyHashable?] = [phase, suspended, currentItemId, playingIndex]
		guard !stopped, state != heardState else { return }
		heardState = state
		onStateChanged?()
	}
}
