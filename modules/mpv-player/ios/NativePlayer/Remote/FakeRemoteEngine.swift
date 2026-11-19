import Foundation

struct FakeRemoteItem: Equatable {
	let id: String
	let durationSec: Double
}

/// A TV that is not there, for the remote chrome's tests and the debug probe: a list of items on a clock
/// that moves one second per progress step, with the Cast engine's transport and queue faces. It has no
/// rendering face, so the chrome reads it as remote. Main thread only, like the Cast engine; after
/// `shutdown()` it announces nothing.
final class FakeRemoteEngine: ChromeEngine {
	/// Runs the closure after a delay in milliseconds and hands back its cancel, as `CastEngine.Delivery`.
	typealias Delivery = (Double, @escaping () -> Void) -> (() -> Void)

	static let defaultItems = (1...3).map {
		FakeRemoteItem(id: "fake-episode-\($0)", durationSec: PlayerConstants.fakeRemoteItemSec)
	}

	weak var delegate: PlayerEngineDelegate?

	private let deliver: Delivery
	private let items: [FakeRemoteItem]
	private var index = 0
	private var position = 0.0
	private var paused = true
	private var loaded = false
	private var stopped = false
	private var cancelLoad: (() -> Void)?
	private var cancelTick: (() -> Void)?
	private var volume = 0.5

	init(deliver: @escaping Delivery, items: [FakeRemoteItem] = FakeRemoteEngine.defaultItems) {
		self.deliver = deliver
		self.items = items
	}

	private var current: FakeRemoteItem? { index < items.count ? items[index] : nil }

	var intendedPlayState: Bool { !paused }
	var canChangeSpeed: Bool { false }
	var currentItemId: String? { loaded ? current?.id : nil }
	var targetVolume: Double? { volume }

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
		}
	}

	func shutdown() {
		stopped = true
		cancelLoad?()
		cancelLoad = nil
		stopTicking()
	}

	func destroy() { shutdown() }

	// A remote screen has no stream to load: what plays is the fake's list.
	func loadVideo(config: VideoLoadConfig, force: Bool) {}

	// MARK: - Transport

	func play() { if loaded && !stopped { setPaused(false) } }
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

	private func setPaused(_ value: Bool) {
		guard paused != value else { return }
		paused = value
		delegate?.engine(self, didChangePause: value)
		if value { stopTicking() } else { scheduleTick() }
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
			delegate?.engineDidReachEnd(self)
			return
		}
		index = next
		position = 0
		report()
	}

	private func report() {
		delegate?.engine(self, didUpdateProgress: position, duration: getDuration(), cacheSeconds: 0)
	}
}
