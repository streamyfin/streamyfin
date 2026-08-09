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

/// Module-level (non-view) player: presents a full-screen native
/// UIViewController with SwiftUI controls over the shared MPVPlayerEngine.
/// Compiles for both iOS and tvOS; the view controller hosts the platform's
/// root view (touch chrome on iOS, focus/remote chrome on tvOS).
/// All Jellyfin orchestration (stream negotiation, session reporting,
/// next-episode resolution) stays in JS — see providers/NativePlayerProvider.tsx.
/// JS must attach every event listener BEFORE calling presentPlayer: module
/// events emitted with no listener are dropped.
public class NativePlayerModule: Module {
	private var session: NativePlayerSession?

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
			"onMuteStateChanged"
		)

		// MARK: - Lifecycle

		AsyncFunction("presentPlayer") { (config: PlayerPresentConfigRecord, promise: Promise) in
			if self.session != nil {
				promise.reject(PlayerAlreadyPresentedException())
				return
			}
			guard config.stream.toVideoLoadConfig() != nil else {
				promise.reject(InvalidStreamUrlException())
				return
			}
			let session = NativePlayerSession(
				emit: { [weak self] name, payload in
					self?.sendEvent(name, payload)
				},
				onTornDown: { [weak self] in
					self?.session = nil
				},
				presenterProvider: { [weak self] in
					self?.appContext?.utilities?.currentViewController()
				}
			)
			self.session = session
			do {
				try session.present(config: config, promise: promise)
			} catch {
				self.session = nil
				promise.reject(error)
			}
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
			guard let session = self.session else {
				// Already gone — dismissal must be idempotent for the JS side.
				promise.resolve()
				return
			}
			session.dismiss(reason: .programmatic) {
				promise.resolve()
			}
		}.runOnQueue(.main)

		Function("isPresented") { () -> Bool in
			return self.session != nil
		}

		// MARK: - Late-arriving data pushes

		AsyncFunction("updateSegments") { (segments: [MediaSegmentRecord]) in
			self.session?.viewModel.updateSegments(segments)
		}.runOnQueue(.main)

		AsyncFunction("updateNextEpisode") { (next: NextEpisodeRecord?) in
			self.session?.viewModel.updateNextEpisode(next)
		}.runOnQueue(.main)

		AsyncFunction("updateChapters") { (chapters: [ChapterRecord]) in
			self.session?.viewModel.updateChapters(chapters)
		}.runOnQueue(.main)

		AsyncFunction("updateTrickplay") { (trickplay: TrickplayRecord?) in
			self.session?.viewModel.updateTrickplay(trickplay)
		}.runOnQueue(.main)

		AsyncFunction("updateTrackMenus") { (menus: TrackMenusRecord) in
			self.session?.viewModel.updateTrackMenus(menus)
		}.runOnQueue(.main)

		AsyncFunction("updateMetadata") { (metadata: MetadataRecord) in
			self.session?.viewModel.updateMetadata(metadata)
			self.session?.applyNowPlayingMetadata(metadata)
		}.runOnQueue(.main)

		AsyncFunction("updateEpisodeList") { (episodes: [EpisodeListItemRecord]) in
			self.session?.viewModel.updateEpisodeList(episodes)
		}.runOnQueue(.main)

		AsyncFunction("updateSubtitleSearch") { (state: SubtitleSearchStateRecord) in
			#if os(iOS)
			self.session?.viewModel.updateSubtitleSearch(state)
			#endif
		}.runOnQueue(.main)

		// Adds a sidecar subtitle to the live mpv handle and selects it
		// (client-side downloaded subtitle file, e.g. OpenSubtitles fallback).
		AsyncFunction("addExternalSubtitle") { (url: String) in
			#if os(iOS)
			self.session?.engine.addSubtitleFile(url: url, select: true)
			#endif
		}.runOnQueue(.main)

		// MARK: - Transport (driven by the JS coordinator: WebSocket remote
		// control commands from the Jellyfin server, not the native UI)

		AsyncFunction("play") {
			self.session?.engine.play()
		}.runOnQueue(.main)

		AsyncFunction("pause") {
			self.session?.engine.pause()
		}.runOnQueue(.main)

		AsyncFunction("seekTo") { (positionSec: Double) in
			self.session?.engine.seekTo(position: positionSec)
		}.runOnQueue(.main)

		AsyncFunction("setSpeed") { (speed: Double) in
			self.session?.viewModel.setSpeed(speed)
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
			guard let engine = self.session?.engine else { return promise.resolve([String: Any]()) }
			engine.getTechnicalInfo { promise.resolve($0) }
		}.runOnQueue(.main)

		OnDestroy {
			// App reload / module teardown while a player is up: tear down
			// synchronously so the mpv handle and audio session are released.
			self.session?.teardownImmediately()
			self.session = nil
		}
	}
}
