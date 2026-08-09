import ExpoModulesCore

// Exceptions shared by both platforms (tvOS builds this file too — the
// generated ExpoModulesProvider references the class on all Apple platforms).

internal final class NativePlayerUnsupportedException: Exception, @unchecked Sendable {
	override var reason: String {
		"The native player is only available on iOS (iPhone/iPad)"
	}
}

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
/// All Jellyfin orchestration (stream negotiation, session reporting,
/// next-episode resolution) stays in JS — see providers/NativePlayerProvider.tsx.
/// JS must attach every event listener BEFORE calling presentPlayer: module
/// events emitted with no listener are dropped.
public class NativePlayerModule: Module {
	#if os(iOS)
	private var session: NativePlayerSession?
	#endif

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
			"onSubtitleSearchRequested", "onSubtitleDownloadRequested"
		)

		// MARK: - Lifecycle

		AsyncFunction("presentPlayer") { (config: PlayerPresentConfigRecord, promise: Promise) in
			#if os(iOS)
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
			#else
			promise.reject(NativePlayerUnsupportedException())
			#endif
		}.runOnQueue(.main)

		AsyncFunction("load") { (config: PlayerPresentConfigRecord, promise: Promise) in
			#if os(iOS)
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
			#else
			promise.reject(NativePlayerUnsupportedException())
			#endif
		}.runOnQueue(.main)

		AsyncFunction("dismiss") { (promise: Promise) in
			#if os(iOS)
			guard let session = self.session else {
				// Already gone — dismissal must be idempotent for the JS side.
				promise.resolve()
				return
			}
			session.dismiss(reason: .programmatic) {
				promise.resolve()
			}
			#else
			promise.resolve()
			#endif
		}.runOnQueue(.main)

		Function("isPresented") { () -> Bool in
			#if os(iOS)
			return self.session != nil
			#else
			return false
			#endif
		}

		// MARK: - Late-arriving data pushes

		AsyncFunction("updateSegments") { (segments: [MediaSegmentRecord]) in
			#if os(iOS)
			self.session?.viewModel.updateSegments(segments)
			#endif
		}.runOnQueue(.main)

		AsyncFunction("updateNextEpisode") { (next: NextEpisodeRecord?) in
			#if os(iOS)
			self.session?.viewModel.updateNextEpisode(next)
			#endif
		}.runOnQueue(.main)

		AsyncFunction("updateChapters") { (chapters: [ChapterRecord]) in
			#if os(iOS)
			self.session?.viewModel.updateChapters(chapters)
			#endif
		}.runOnQueue(.main)

		AsyncFunction("updateTrickplay") { (trickplay: TrickplayRecord?) in
			#if os(iOS)
			self.session?.viewModel.updateTrickplay(trickplay)
			#endif
		}.runOnQueue(.main)

		AsyncFunction("updateTrackMenus") { (menus: TrackMenusRecord) in
			#if os(iOS)
			self.session?.viewModel.updateTrackMenus(menus)
			#endif
		}.runOnQueue(.main)

		AsyncFunction("updateMetadata") { (metadata: MetadataRecord) in
			#if os(iOS)
			self.session?.viewModel.updateMetadata(metadata)
			self.session?.applyNowPlayingMetadata(metadata)
			#endif
		}.runOnQueue(.main)

		AsyncFunction("updateEpisodeList") { (episodes: [EpisodeListItemRecord]) in
			#if os(iOS)
			self.session?.viewModel.updateEpisodeList(episodes)
			#endif
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
			#if os(iOS)
			self.session?.engine.play()
			#endif
		}.runOnQueue(.main)

		AsyncFunction("pause") {
			#if os(iOS)
			self.session?.engine.pause()
			#endif
		}.runOnQueue(.main)

		AsyncFunction("seekTo") { (positionSec: Double) in
			#if os(iOS)
			self.session?.engine.seekTo(position: positionSec)
			#endif
		}.runOnQueue(.main)

		AsyncFunction("setSpeed") { (speed: Double) in
			#if os(iOS)
			self.session?.viewModel.setSpeed(speed)
			#endif
		}.runOnQueue(.main)

		AsyncFunction("getCurrentPosition") { () -> Double in
			#if os(iOS)
			return self.session?.engine.getCurrentPosition() ?? 0
			#else
			return 0
			#endif
		}.runOnQueue(.main)

		AsyncFunction("getDuration") { () -> Double in
			#if os(iOS)
			return self.session?.engine.getDuration() ?? 0
			#else
			return 0
			#endif
		}.runOnQueue(.main)

		// MARK: - Track plumbing for the JS identity resolver
		// (utils/jellyfin/subtitleUtils.ts drives these through a
		// SubtitleSelectablePlayer facade; selection logic never lives here)

		AsyncFunction("getSubtitleTracks") { () -> [[String: Any]] in
			#if os(iOS)
			return self.session?.engine.getSubtitleTracks() ?? []
			#else
			return []
			#endif
		}.runOnQueue(.main)

		AsyncFunction("setSubtitleTrack") { (mpvId: Int) in
			#if os(iOS)
			self.session?.engine.setSubtitleTrack(mpvId)
			#endif
		}.runOnQueue(.main)

		AsyncFunction("disableSubtitles") {
			#if os(iOS)
			self.session?.engine.disableSubtitles()
			#endif
		}.runOnQueue(.main)

		AsyncFunction("getAudioTracks") { () -> [[String: Any]] in
			#if os(iOS)
			return self.session?.engine.getAudioTracks() ?? []
			#else
			return []
			#endif
		}.runOnQueue(.main)

		AsyncFunction("setAudioTrack") { (mpvId: Int) in
			#if os(iOS)
			self.session?.engine.setAudioTrack(mpvId)
			#endif
		}.runOnQueue(.main)

		AsyncFunction("getTechnicalInfo") { () -> [String: Any] in
			#if os(iOS)
			return self.session?.engine.getTechnicalInfo() ?? [:]
			#else
			return [:]
			#endif
		}.runOnQueue(.main)

		OnDestroy {
			#if os(iOS)
			// App reload / module teardown while a player is up: tear down
			// synchronously so the mpv handle and audio session are released.
			self.session?.teardownImmediately()
			self.session = nil
			#endif
		}
	}
}
