import ExpoModulesCore

internal final class PlayerAlreadyPresentedException: Exception, @unchecked Sendable {
	override var reason: String {
		"A native player is already presented; call load() to swap the stream instead"
	}
}

internal final class NoActivePlayerException: Exception, @unchecked Sendable {
	override var reason: String {
		"No native player is currently presented"
	}
}

internal final class InvalidStreamUrlException: Exception, @unchecked Sendable {
	override var reason: String {
		"The stream config contains an unparseable URL"
	}
}

internal final class UnsupportedEngineException: GenericException<String>, @unchecked Sendable {
	override var reason: String {
		"The native player does not run the engine \"\(param)\""
	}
}

internal final class NoRemoteEngineException: Exception, @unchecked Sendable {
	override var reason: String {
		"No remote engine to present a remote player over"
	}
}

internal final class RemotePlayerUnsupportedException: Exception, @unchecked Sendable {
	override var reason: String {
		"This device does not present a remote player"
	}
}

/// Module-level (non-view) player: presents a full-screen native
/// UIViewController with SwiftUI controls over the engine the config names.
/// Compiles for both iOS and tvOS; the view controller hosts the platform's
/// root view (touch chrome on iOS, focus/remote chrome on tvOS).
/// All Jellyfin orchestration (stream negotiation, session reporting,
/// next-episode resolution) stays in JS — see providers/NativePlayerProvider.tsx.
/// JS must attach every event listener BEFORE calling presentPlayer: module
/// events emitted with no listener are dropped.
public class NativePlayerModule: Module {
	/// The player presented, local or remote: one at a time.
	private var presented: PresentedPlayer?

	/// The local player, for its own calls: load, mpv tracks, SyncPlay, technical info, Now Playing.
	private var session: NativePlayerSession? { presented as? NativePlayerSession }

	/// What JS's transport calls reach: the local player's view model, never the remote one's.
	private var transport: PlayerViewModel? { jsTransportTarget(presented) }

	private static func exception(for refusal: PresentRefusal) -> Exception {
		switch refusal {
		case .alreadyPresented: return PlayerAlreadyPresentedException()
		case .invalidStream: return InvalidStreamUrlException()
		case let .unsupportedEngine(name): return UnsupportedEngineException(name)
		case .noRemoteEngine: return NoRemoteEngineException()
		case .remoteUnsupported: return RemotePlayerUnsupportedException()
		}
	}

	/// The remote engine a screen borrows, nil without one. Tier 1 builds (fake Cast receivers) lend a fake
	/// TV, shut down when the screen hands it back; the engine bound to a real Cast session comes later.
	private static func remoteEngineLease() -> RemoteEngineLease? {
		#if os(iOS) && !targetEnvironment(macCatalyst)
		guard RemoteTargets.fakeDevices else { return nil }
		let fake = FakeRemoteEngine(deliver: mainQueueSchedule)
		return RemoteEngineLease(engine: fake) { fake.shutdown() }
		#else
		return nil
		#endif
	}

	/// tvOS and Catalyst do not cast, so they never present the remote player.
	private static var castsFromThisDevice: Bool {
		#if os(tvOS) || targetEnvironment(macCatalyst)
		return false
		#else
		return true
		#endif
	}

	public func definition() -> ModuleDefinition {
		Name("NativePlayer")

		Events(
			"onLoad", "onProgress", "onPlaybackStateChange", "onError",
			"onTracksReady", "onPictureInPictureChange",
			"onTrackSelectionRequested", "onSpeedChange",
			"onQualitySelected", "onSubtitleScaleChange",
			"onOrientationChangeRequested",
			"onNextEpisodeRequested", "onPreviousEpisodeRequested",
			"onEpisodeSelected", "onPlaybackEnded", "onDismiss",
			"onSubtitleSearchRequested", "onSubtitleDownloadRequested",
			"onMuteStateChanged", "onSyncPlayAction", "onCastHandOffRequested"
		)

		// MARK: - Lifecycle

		AsyncFunction("presentPlayer") { (config: PlayerPresentConfigRecord, promise: Promise) in
			if let refusal = PresentRefusal(
				presented: self.presented != nil,
				streamIsValid: config.stream.toVideoLoadConfig() != nil,
				engine: config.engine
			) {
				promise.reject(Self.exception(for: refusal))
				return
			}
			// The refusal above already turned every other name away: this only unwraps the kind.
			guard let kind = NativeEngineKind(configName: config.engine) else {
				promise.reject(UnsupportedEngineException(config.engine ?? ""))
				return
			}
			let session = NativePlayerSession(
				engine: Self.makeEngine(kind),
				emit: { [weak self] name, payload in
					self?.sendEvent(name, payload)
				},
				onTornDown: { [weak self] in
					self?.presented = nil
				},
				presenterProvider: { [weak self] in
					self?.appContext?.utilities?.currentViewController()
				}
			)
			self.presented = session
			do {
				try session.present(config: config, promise: promise)
			} catch {
				self.presented = nil
				promise.reject(error)
			}
		}.runOnQueue(.main)

		// The remote player: the chrome over a remote engine, apart from the local player's entry.
		AsyncFunction("presentRemotePlayer") { (config: RemotePlayerConfigRecord, promise: Promise) in
			let isTv = !Self.castsFromThisDevice
			let alreadyPresented = self.presented != nil
			let lease = !alreadyPresented && !isTv ? Self.remoteEngineLease() : nil
			if let refusal = PresentRefusal(
				presented: alreadyPresented, hasRemoteEngine: lease != nil, isTv: isTv
			) {
				promise.reject(Self.exception(for: refusal))
				return
			}
			#if os(iOS)
			// The refusal above already turned a missing lease away: this only unwraps it.
			guard let lease else {
				promise.reject(NoRemoteEngineException())
				return
			}
			let remote = RemotePlayerSession(
				lease: lease,
				emit: { [weak self] name, body in
					self?.sendEvent(name, body)
				},
				onTornDown: { [weak self] in
					self?.presented = nil
				},
				presenterProvider: { [weak self] in
					self?.appContext?.utilities?.currentViewController()
				}
			)
			self.presented = remote
			do {
				try remote.present(config: config, promise: promise)
			} catch {
				remote.teardownImmediately()
				self.presented = nil
				promise.reject(error)
			}
			#else
			promise.reject(RemotePlayerUnsupportedException())
			#endif
		}.runOnQueue(.main)

		AsyncFunction("load") { (config: PlayerPresentConfigRecord, promise: Promise) in
			guard let session = self.session else {
				promise.reject(NoActivePlayerException())
				return
			}
			guard config.stream.toVideoLoadConfig() != nil else {
				promise.reject(InvalidStreamUrlException())
				return
			}
			session.load(config: config)
			promise.resolve()
		}.runOnQueue(.main)

		AsyncFunction("dismiss") { (promise: Promise) in
			guard let presented = self.presented else {
				// Already gone — dismissal must be idempotent for the JS side.
				promise.resolve()
				return
			}
			presented.dismiss(reason: .programmatic) {
				promise.resolve()
			}
		}.runOnQueue(.main)

		Function("isPresented") { () -> Bool in
			return self.presented != nil
		}

		// MARK: - Late-arriving data pushes

		AsyncFunction("updateSyncPlay") { (state: SyncPlayStateRecord?) in
			self.session?.viewModel.updateSyncPlay(state)
		}.runOnQueue(.main)

		AsyncFunction("applySyncPlayCommand") { (command: SyncPlayCommandRecord, promise: Promise) in
			guard let session = self.session else { promise.resolve(false); return }
			session.viewModel.applySyncPlayCommand(command) { applied in promise.resolve(applied) }
		}.runOnQueue(.main)

		AsyncFunction("cancelSyncPlayCommands") { () in
			self.session?.viewModel.cancelSyncPlayCommands()
		}.runOnQueue(.main)

		AsyncFunction("updateSegments") { (segments: [MediaSegmentRecord]) in
			self.presented?.viewModel.updateSegments(segments)
		}.runOnQueue(.main)

		AsyncFunction("updateNextEpisode") { (next: NextEpisodeRecord?) in
			self.presented?.viewModel.updateNextEpisode(next)
		}.runOnQueue(.main)

		AsyncFunction("updateChapters") { (chapters: [ChapterRecord]) in
			self.presented?.viewModel.updateChapters(chapters)
		}.runOnQueue(.main)

		AsyncFunction("updateTrickplay") { (trickplay: TrickplayRecord?) in
			self.presented?.viewModel.updateTrickplay(trickplay)
		}.runOnQueue(.main)

		AsyncFunction("updateTrackMenus") { (menus: TrackMenusRecord) in
			self.presented?.viewModel.updateTrackMenus(menus)
		}.runOnQueue(.main)

		AsyncFunction("updateMetadata") { (metadata: MetadataRecord) in
			self.presented?.viewModel.updateMetadata(metadata)
			// Now Playing is the local player's: a remote screen has no entry there.
			self.session?.applyNowPlayingMetadata(metadata)
		}.runOnQueue(.main)

		AsyncFunction("updateEpisodeList") { (episodes: [EpisodeListItemRecord]) in
			self.presented?.viewModel.updateEpisodeList(episodes)
		}.runOnQueue(.main)

		AsyncFunction("updateSubtitleSearch") { (state: SubtitleSearchStateRecord) in
			self.presented?.viewModel.updateSubtitleSearch(state)
		}.runOnQueue(.main)

		// Transient one-line notice on the player's own notice surface, for
		// things the JS coordinator decides (automatic subtitles on mute).
		AsyncFunction("showNotice") { (text: String) in
			self.presented?.viewModel.showNotice(text)
		}.runOnQueue(.main)

		// Jellyfin remote ToggleMute. Same entry point as the TV mute button.
		AsyncFunction("toggleMute") {
			self.transport?.toggleMute()
		}.runOnQueue(.main)

		// Adds a sidecar subtitle to the live mpv handle and selects it
		// (client-side downloaded subtitle file, e.g. OpenSubtitles fallback).
		AsyncFunction("addExternalSubtitle") { (url: String) in
			self.session?.engine.addSubtitleFile(url: url, select: true)
		}.runOnQueue(.main)

		// MARK: - Transport (driven by the JS coordinator: WebSocket remote
		// control commands from the Jellyfin server, not the native UI). The
		// local player only, through `session` and `transport`: a command
		// addressed to the phone must never drive the TV.

		AsyncFunction("play") {
			self.session?.engine.play()
		}.runOnQueue(.main)

		AsyncFunction("pause") {
			self.session?.engine.pause()
		}.runOnQueue(.main)

		// Through the view model, not straight to the engine: a remote seek has
		// to arm pendingSeekReport and move the tracked position like a native
		// one, or the server keeps reporting the pre-seek position until the
		// next 10s interval. Android routes this the same way.
		AsyncFunction("seekTo") { (positionSec: Double) in
			self.transport?.seekFromCoordinator(to: positionSec)
		}.runOnQueue(.main)

		AsyncFunction("setSpeed") { (speed: Double) in
			self.transport?.setSpeed(speed)
		}.runOnQueue(.main)

		AsyncFunction("getCurrentPosition") { () -> Double in
			return self.session?.engine.getCurrentPosition() ?? 0
		}.runOnQueue(.main)

		AsyncFunction("getDuration") { () -> Double in
			return self.session?.engine.getDuration() ?? 0
		}.runOnQueue(.main)

		// MARK: - Track plumbing for the JS identity resolver
		// (utils/jellyfin/subtitleUtils.ts drives these through a
		// SubtitleSelectablePlayer facade; selection logic never lives here)

		// Track/info getters resolve via completion: the underlying mpv
		// property reads block on the core and must never run on the main
		// thread (vo_create deadlock → 0x8BADF00D watchdog kill; see
		// MPVLayerRenderer.onQueue). Main is only used to read self.session.
		// (develop gates these to iOS; this branch runs the engine on tvOS
		// too, so the non-blocking path applies on both.)
		AsyncFunction("getSubtitleTracks") { (promise: Promise) in
			guard let engine = self.session?.engine else { return promise.resolve([[String: Any]]()) }
			engine.getSubtitleTracks { promise.resolve($0) }
		}.runOnQueue(.main)

		AsyncFunction("setSubtitleTrack") { (mpvId: Int) in
			self.session?.engine.setSubtitleTrack(mpvId)
		}.runOnQueue(.main)

		AsyncFunction("disableSubtitles") {
			self.session?.engine.disableSubtitles()
		}.runOnQueue(.main)

		AsyncFunction("getAudioTracks") { (promise: Promise) in
			guard let engine = self.session?.engine else { return promise.resolve([[String: Any]]()) }
			engine.getAudioTracks { promise.resolve($0) }
		}.runOnQueue(.main)

		AsyncFunction("setAudioTrack") { (mpvId: Int) in
			self.session?.engine.setAudioTrack(mpvId)
		}.runOnQueue(.main)

		AsyncFunction("getTechnicalInfo") { (promise: Promise) in
			readTechnicalInfo(from: self.session?.engine) { promise.resolve($0) }
		}.runOnQueue(.main)

		OnDestroy {
			// App reload / module teardown while a player is up: tear down
			// synchronously so the mpv handle and audio session are released.
			self.presented?.teardownImmediately()
			self.presented = nil
		}
	}

	/// The engine a kind stands for. No default case: a kind added later does not compile here
	/// until it is built.
	private static func makeEngine(_ kind: NativeEngineKind) -> ChromeEngine {
		switch kind {
		case .mpv: return MPVPlayerEngine()
		}
	}
}
