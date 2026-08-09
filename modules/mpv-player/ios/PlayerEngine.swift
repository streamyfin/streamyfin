import AVFAudio
import AVFoundation
import CoreMedia
import MediaPlayer
import UIKit

/// Delegate mirroring `MPVLayerRendererDelegate` granularity so the two hosts
/// (`MpvPlayerView` for the RN-embedded player, `NativePlayerViewController`
/// for the presented native player) can map callbacks 1:1 onto their own
/// event surfaces without any payload translation. All callbacks arrive on
/// the main thread.
protocol MPVPlayerEngineDelegate: AnyObject {
	func engine(_ engine: MPVPlayerEngine, didLoad url: URL)
	func engine(_ engine: MPVPlayerEngine, didUpdateProgress position: Double, duration: Double, cacheSeconds: Double)
	func engine(_ engine: MPVPlayerEngine, didChangePause isPaused: Bool)
	func engine(_ engine: MPVPlayerEngine, didChangeLoading isLoading: Bool)
	func engine(_ engine: MPVPlayerEngine, didBecomeReadyToSeek ready: Bool)
	func engine(_ engine: MPVPlayerEngine, didBecomeTracksReady ready: Bool)
	func engine(_ engine: MPVPlayerEngine, didChangePictureInPicture isActive: Bool)
	func engine(_ engine: MPVPlayerEngine, didFailWithError message: String)
	func engine(_ engine: MPVPlayerEngine, didDetectHDRMode mode: HDRMode, fps: Double)
	func engineDidReachEnd(_ engine: MPVPlayerEngine)
}

/// Non-UI playback engine: owns the display layer, the libmpv renderer, PiP,
/// Now Playing and the audio session. Hosts are responsible only for putting
/// `displayLayer` into a layer tree and keeping its frame updated.
final class MPVPlayerEngine: NSObject {
	weak var delegate: MPVPlayerEngineDelegate?

	/// Hosts add this to their layer tree and update its frame on layout.
	let displayLayer = AVSampleBufferDisplayLayer()

	private var renderer: MPVLayerRenderer?
	private var pipController: PiPController?
	private let nowPlayingManager = MPVNowPlayingManager.shared

	private var currentURL: URL?
	private var cachedPosition: Double = 0
	private var cachedDuration: Double = 0
	private(set) var intendedPlayState: Bool = false
	private var _isZoomedToFill: Bool = false
	private var isShutDown = false

	override init() {
		super.init()

		displayLayer.videoGravity = .resizeAspect
		#if !os(tvOS)
		if #available(iOS 17.0, *) {
			displayLayer.wantsExtendedDynamicRangeContent = true
		}
		#endif
		displayLayer.backgroundColor = UIColor.black.cgColor

		renderer = MPVLayerRenderer(displayLayer: displayLayer)
		renderer?.delegate = self

		pipController = PiPController(sampleBufferDisplayLayer: displayLayer)
		pipController?.delegate = self

		NotificationCenter.default.addObserver(
			self, selector: #selector(handleAudioSessionInterruption),
			name: AVAudioSession.interruptionNotification, object: nil)
	}

	func start() throws {
		try renderer?.start()
	}

	// MARK: - Audio Session

	private func configureAudioSession() {
		let session = AVAudioSession.sharedInstance()
		do {
			try session.setCategory(.playback, mode: .moviePlayback, policy: .longFormAudio, options: [])
			try session.setActive(true)
		} catch {
			print("Failed to configure audio session: \(error)")
		}
	}

	/// Deactivate the session AND reset the category — `setActive(false)` alone
	/// leaves `.playback`/`.longFormAudio` on the shared singleton, so any later
	/// reactivation (foreground, route change, other modules) re-steals audio.
	private func tearDownAudioSession() {
		let session = AVAudioSession.sharedInstance()
		try? session.setActive(false, options: .notifyOthersOnDeactivation)
		try? session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
	}

	@objc private func handleAudioSessionInterruption(_ notification: Notification) {
		guard let userInfo = notification.userInfo,
			  let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
			  let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
			return
		}

		switch type {
		case .began:
			// Interruption began - pause the video
			print("[MPV] Audio session interrupted - pausing video")
			self.pause()

		case .ended:
			// Interruption ended - check if we should resume
			if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
				let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
				if options.contains(.shouldResume) {
					print("[MPV] Audio session interruption ended - can resume")
					// Don't auto-resume - let user manually resume playback
				} else {
					print("[MPV] Audio session interruption ended - should not resume")
				}
			}

		@unknown default:
			break
		}
	}

	private func setupRemoteCommands() {
		nowPlayingManager.setupRemoteCommands(
			playHandler: { [weak self] in self?.play() },
			pauseHandler: { [weak self] in self?.pause() },
			toggleHandler: { [weak self] in
				guard let self else { return }
				if self.intendedPlayState { self.pause() } else { self.play() }
			},
			seekHandler: { [weak self] time in self?.seekTo(position: time) },
			skipForward: { [weak self] interval in self?.seekBy(offset: interval) },
			skipBackward: { [weak self] interval in self?.seekBy(offset: -interval) }
		)
	}

	// MARK: - Now Playing Info

	func setNowPlayingMetadata(_ metadata: [String: String]) {
		print("[MPV] setNowPlayingMetadata: \(metadata["title"] ?? "nil")")
		nowPlayingManager.setMetadata(
			title: metadata["title"],
			artist: metadata["artist"],
			albumTitle: metadata["albumTitle"],
			artworkUrl: metadata["artworkUri"]
		)
	}

	private func clearNowPlayingInfo() {
		nowPlayingManager.cleanupRemoteCommands()
		nowPlayingManager.deactivateAudioSession()
		nowPlayingManager.clear()
	}

	/// Single location for Now Playing updates
	private func syncNowPlaying(isPlaying: Bool) {
		print("[MPV] syncNowPlaying: pos=\(Int(cachedPosition))s, dur=\(Int(cachedDuration))s, playing=\(isPlaying)")
		nowPlayingManager.updatePlayback(position: cachedPosition, duration: cachedDuration, isPlaying: isPlaying)
	}

	// MARK: - Loading

	/// - Parameter force: reload even when the URL matches the current one.
	///   The presented native player re-negotiates streams in place (burned-in
	///   subtitles, bitrate changes) where the URL can legitimately repeat.
	func loadVideo(config: VideoLoadConfig, force: Bool = false) {
		// Skip reload if same URL is already playing
		if !force && currentURL == config.url {
			return
		}
		currentURL = config.url
		// Paired with the disarm in destroy(), which the reused view would
		// otherwise never undo.
		pipController?.setAutoStartEnabled(true)

		let preset = PlayerPreset(
			id: .sdrRec709,
			title: "Default",
			summary: "Default playback preset",
			stream: nil,
			commands: []
		)

		// Pass everything to the renderer - it handles start position and external subs
		renderer?.load(
			url: config.url,
			with: preset,
			headers: config.headers,
			startPosition: config.startPosition,
			externalSubtitles: config.externalSubtitles,
			initialSubtitleId: config.initialSubtitleId,
			initialAudioId: config.initialAudioId,
			cacheEnabled: config.cacheEnabled,
			cacheSeconds: config.cacheSeconds,
			demuxerMaxBytes: config.demuxerMaxBytes,
			demuxerMaxBackBytes: config.demuxerMaxBackBytes
		)

		if config.autoplay {
			play()
		}

		delegate?.engine(self, didLoad: config.url)
	}

	// MARK: - Transport

	func play() {
		intendedPlayState = true
		configureAudioSession()
		setupRemoteCommands()
		renderer?.play()
		pipController?.setPlaybackRate(1.0)
		pipController?.updatePlaybackState()
	}

	func pause() {
		intendedPlayState = false
		renderer?.pausePlayback()
		pipController?.setPlaybackRate(0.0)
		pipController?.updatePlaybackState()
	}

	/**
	 * Synchronously stop and destroy the mpv instance + decoder so memory is
	 * freed before the next screen mounts. Safe to call multiple times — the
	 * underlying renderer.stop() guards against re-entry.
	 *
	 * Cross-platform counterpart of MpvPlayerView.destroy() on Android.
	 */
	func destroy() {
		// Release the system's single inline auto-PiP slot now; deinit is deferred
		// and would otherwise keep it claimed, blocking PiP for the next video.
		pipController?.setAutoStartEnabled(false)
		renderer?.stop()

		// Reset state and re-create the mpv handle so a subsequent
		// loadVideo() on the SAME engine instance can actually load.
		// Without this, stop() leaves renderer.mpv == nil, and the next
		// loadVideo(config:) calls renderer.load() which early-returns
		// at `guard let handle = self.mpv else { return }` — but only
		// after flipping isLoading = true and dispatching the loading
		// delegate callback, so the JS layer is stuck in a perpetual
		// "loading" state with no actual playback.
		//
		// This path is hit by direct-player.tsx's goToNextItem()/stop(),
		// which call destroy() immediately before router.replace() to
		// the same route — Expo Router reuses the same MpvPlayerView
		// instance, so the next `source` prop update arrives on this
		// view without a remount. Engine init is otherwise the only
		// place start() is called, so without re-starting here the
		// renderer stays dead until the whole host is deallocated and
		// recreated.
		//
		// start() is idempotent (`guard !isRunning else { return }`)
		// and stop() has already nulled mpv synchronously before
		// dispatching the async mpv_terminate_destroy, so creating a
		// fresh handle here is safe even while the old handle's
		// teardown is still in flight on a background queue (libmpv
		// handles are independent).
		currentURL = nil
		intendedPlayState = false
		do {
			try renderer?.start()
		} catch {
			delegate?.engine(self, didFailWithError: "Failed to restart renderer after destroy: \(error.localizedDescription)")
		}
	}

	/// Full teardown for hosts that are going away. Idempotent; mirrors the
	/// old MpvPlayerView.deinit ordering (PiP → renderer → layer → Now
	/// Playing → audio session). The renderer's stop() already performs
	/// mpv_terminate_destroy on a background queue — never reorder that.
	func shutdown() {
		guard !isShutDown else { return }
		isShutDown = true
		pipController?.stopPictureInPicture()
		renderer?.stop()
		displayLayer.removeFromSuperlayer()
		clearNowPlayingInfo()
		tearDownAudioSession()
		NotificationCenter.default.removeObserver(self)
	}

	deinit {
		shutdown()
	}

	func seekTo(position: Double) {
		// Update cached position and Now Playing immediately for smooth Control Center feedback
		cachedPosition = position
		syncNowPlaying(isPlaying: !isPaused())
		renderer?.seek(to: position)
	}

	func seekBy(offset: Double) {
		// Update cached position and Now Playing immediately for smooth Control Center feedback
		let newPosition = max(0, min(cachedPosition + offset, cachedDuration))
		cachedPosition = newPosition
		syncNowPlaying(isPlaying: !isPaused())
		renderer?.seek(by: offset)
	}

	func setSpeed(speed: Double) {
		renderer?.setSpeed(speed)
	}

	func getSpeed() -> Double {
		return renderer?.getSpeed() ?? 1.0
	}

	func isPaused() -> Bool {
		return renderer?.isPausedState ?? true
	}

	func getCurrentPosition() -> Double {
		return cachedPosition
	}

	func getDuration() -> Double {
		return cachedDuration
	}

	// MARK: - Picture in Picture

	func setPictureInPictureAutoStartEnabled(_ enabled: Bool) {
		pipController?.setAutoStartEnabled(enabled)
	}

	func startPictureInPicture() {
		print("🎬 MPVPlayerEngine: startPictureInPicture called")
		print("🎬 Duration: \(getDuration()), IsPlaying: \(!isPaused())")
		pipController?.startPictureInPicture()
	}

	func stopPictureInPicture() {
		pipController?.stopPictureInPicture()
	}

	func isPictureInPictureSupported() -> Bool {
		return pipController?.isPictureInPictureSupported ?? false
	}

	func isPictureInPictureActive() -> Bool {
		return pipController?.isPictureInPictureActive ?? false
	}

	// MARK: - Subtitle Controls

	func getSubtitleTracks() -> [[String: Any]] {
		return renderer?.getSubtitleTracks() ?? []
	}

	func setSubtitleTrack(_ trackId: Int) {
		renderer?.setSubtitleTrack(trackId)
	}

	func disableSubtitles() {
		renderer?.disableSubtitles()
	}

	func getCurrentSubtitleTrack() -> Int {
		return renderer?.getCurrentSubtitleTrack() ?? 0
	}

	func addSubtitleFile(url: String, select: Bool = true) {
		renderer?.addSubtitleFile(url: url, select: select)
	}

	// MARK: - Audio Track Controls

	func getAudioTracks() -> [[String: Any]] {
		return renderer?.getAudioTracks() ?? []
	}

	func setAudioTrack(_ trackId: Int) {
		renderer?.setAudioTrack(trackId)
	}

	func getCurrentAudioTrack() -> Int {
		return renderer?.getCurrentAudioTrack() ?? 0
	}

	// MARK: - Subtitle Positioning

	func setSubtitlePosition(_ position: Int) {
		renderer?.setSubtitlePosition(position)
	}

	func setSubtitleScale(_ scale: Double) {
		renderer?.setSubtitleScale(scale)
	}

	func setSubtitleDelay(_ seconds: Double) {
		renderer?.setSubtitleDelay(seconds)
	}

	func setAudioDelay(_ seconds: Double) {
		renderer?.setAudioDelay(seconds)
	}

	/// Software gain in percent: 100 = neutral, above amplifies (mpv softvol).
	func setVolumeBoost(_ percent: Int) {
		renderer?.setVolumeBoost(percent)
	}

	/// Speech-clarity EQ toggle (bass cut + presence boost via mpv af/lavfi).
	func setDialogueBoost(_ enabled: Bool) {
		renderer?.setDialogueBoost(enabled)
	}

	func setSubtitleMarginY(_ margin: Int) {
		renderer?.setSubtitleMarginY(margin)
	}

	func setSubtitleAlignX(_ alignment: String) {
		renderer?.setSubtitleAlignX(alignment)
	}

	func setSubtitleAlignY(_ alignment: String) {
		renderer?.setSubtitleAlignY(alignment)
	}

	func setSubtitleFontSize(_ size: Int) {
		renderer?.setSubtitleFontSize(size)
	}

	func setSubtitleBackgroundColor(_ color: String) {
		renderer?.setSubtitleBackgroundColor(color)
	}

	func setSubtitleBorderStyle(_ style: String) {
		renderer?.setSubtitleBorderStyle(style)
	}

	func setSubtitleAssOverride(_ mode: String) {
		renderer?.setSubtitleAssOverride(mode)
	}

	// MARK: - Video Scaling

	func setZoomedToFill(_ zoomed: Bool) {
		_isZoomedToFill = zoomed
		displayLayer.videoGravity = zoomed ? .resizeAspectFill : .resizeAspect
	}

	func isZoomedToFill() -> Bool {
		return _isZoomedToFill
	}

	// MARK: - Technical Info

	func getTechnicalInfo() -> [String: Any] {
		return renderer?.getTechnicalInfo() ?? [:]
	}
}

// MARK: - MPVLayerRendererDelegate

extension MPVPlayerEngine: MPVLayerRendererDelegate {
	func renderer(_: MPVLayerRenderer, didUpdatePosition position: Double, duration: Double, cacheSeconds: Double) {
		cachedPosition = position
		cachedDuration = duration

		DispatchQueue.main.async { [weak self] in
			guard let self else { return }

			if self.pipController?.isPictureInPictureActive == true {
				self.pipController?.setCurrentTimeFromSeconds(position, duration: duration)
			}

			self.delegate?.engine(self, didUpdateProgress: position, duration: duration, cacheSeconds: cacheSeconds)
		}
	}

	func renderer(_: MPVLayerRenderer, didChangePause isPaused: Bool) {
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }

			print("[MPV] didChangePause: isPaused=\(isPaused), cachedDuration=\(self.cachedDuration)")
			self.pipController?.setPlaybackRate(isPaused ? 0.0 : 1.0)
			self.syncNowPlaying(isPlaying: !isPaused)
			self.delegate?.engine(self, didChangePause: isPaused)
		}
	}

	func renderer(_: MPVLayerRenderer, didChangeLoading isLoading: Bool) {
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }
			self.delegate?.engine(self, didChangeLoading: isLoading)
		}
	}

	func renderer(_: MPVLayerRenderer, didBecomeReadyToSeek ready: Bool) {
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }
			self.delegate?.engine(self, didBecomeReadyToSeek: ready)
		}
	}

	func renderer(_: MPVLayerRenderer, didBecomeTracksReady ready: Bool) {
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }
			self.delegate?.engine(self, didBecomeTracksReady: ready)
		}
	}

	func renderer(_: MPVLayerRenderer, didDetectHDRMode mode: HDRMode, fps: Double) {
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }
			self.delegate?.engine(self, didDetectHDRMode: mode, fps: fps)
		}
	}

	func renderer(_: MPVLayerRenderer, didSelectAudioOutput audioOutput: String) {
		print("[MPV] Audio output ready (\(audioOutput)), syncing Now Playing")
		// mpv reconfigures the shared AVAudioSession when its audio unit spins up,
		// overriding what play() set. Until ours is re-applied the system doesn't
		// treat us as the Now Playing app and drops every info update.
		configureAudioSession()
		syncNowPlaying(isPlaying: intendedPlayState)
	}

	func rendererDidReachEnd(_: MPVLayerRenderer) {
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }
			self.delegate?.engineDidReachEnd(self)
		}
	}
}

// MARK: - PiPControllerDelegate

extension MPVPlayerEngine: PiPControllerDelegate {
	func pipController(_ controller: PiPController, willStartPictureInPicture: Bool) {
		print("PiP will start")
		// Sync timebase before PiP starts for smooth transition
		renderer?.syncTimebase()
		// Set current time for PiP progress bar
		pipController?.setCurrentTimeFromSeconds(cachedPosition, duration: cachedDuration)

		// Reset to fit for PiP (zoomed video doesn't display correctly in PiP)
		if _isZoomedToFill {
			displayLayer.videoGravity = .resizeAspect
		}
	}

	func pipController(_ controller: PiPController, didStartPictureInPicture: Bool) {
		print("PiP did start: \(didStartPictureInPicture)")
		// Ensure current time is synced when PiP starts
		pipController?.setCurrentTimeFromSeconds(cachedPosition, duration: cachedDuration)
		// Notify the host of the actual PiP active state. `didStartPictureInPicture`
		// is `false` when AVKit reports a failure to start, so reflect that.
		delegate?.engine(self, didChangePictureInPicture: didStartPictureInPicture)
	}

	func pipController(_ controller: PiPController, willStopPictureInPicture: Bool) {
		print("PiP will stop")
		// Sync timebase before returning from PiP
		renderer?.syncTimebase()
	}

	func pipController(_ controller: PiPController, didStopPictureInPicture: Bool) {
		print("PiP did stop")
		// Ensure timebase is synced after PiP ends
		renderer?.syncTimebase()
		pipController?.updatePlaybackState()

		// Restore the user's zoom preference
		if _isZoomedToFill {
			displayLayer.videoGravity = .resizeAspectFill
		}
		// Notify the host that PiP has fully stopped so the controls overlay
		// can be re-mounted when the user returns to full screen.
		delegate?.engine(self, didChangePictureInPicture: false)
	}

	func pipController(_ controller: PiPController, restoreUserInterfaceForPictureInPictureStop completionHandler: @escaping (Bool) -> Void) {
		print("PiP restore user interface")
		completionHandler(true)
	}

	func pipControllerPlay(_ controller: PiPController) {
		print("PiP play requested")
		intendedPlayState = true
		renderer?.play()
		pipController?.setPlaybackRate(1.0)
	}

	func pipControllerPause(_ controller: PiPController) {
		print("PiP pause requested")
		intendedPlayState = false
		renderer?.pausePlayback()
		pipController?.setPlaybackRate(0.0)
	}

	func pipController(_ controller: PiPController, skipByInterval interval: CMTime) {
		let seconds = CMTimeGetSeconds(interval)
		print("PiP skip by interval: \(seconds)")
		let target = max(0, cachedPosition + seconds)
		seekTo(position: target)
	}

	func pipControllerIsPlaying(_ controller: PiPController) -> Bool {
		// Use intended state to ignore transient pauses during seeking
		return intendedPlayState
	}

	func pipControllerDuration(_ controller: PiPController) -> Double {
		return getDuration()
	}

	func pipControllerCurrentPosition(_ controller: PiPController) -> Double {
		return getCurrentPosition()
	}
}
