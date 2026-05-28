import AVFAudio
import AVFoundation
import CoreMedia
import ExpoModulesCore
import MediaPlayer
import UIKit

/// Configuration for loading a video
struct VideoLoadConfig {
	let url: URL
	var headers: [String: String]?
	var externalSubtitles: [String]?
	var startPosition: Double?
	var autoplay: Bool
	/// MPV subtitle track ID to select on start (1-based, -1 to disable, nil to use default)
	var initialSubtitleId: Int?
	/// MPV audio track ID to select on start (1-based, nil to use default)
	var initialAudioId: Int?
	/// Cache/buffer settings
	var cacheEnabled: String?  // "auto", "yes", or "no"
	var cacheSeconds: Int?     // Seconds of video to buffer
	var demuxerMaxBytes: Int?  // Max cache size in MB
	var demuxerMaxBackBytes: Int?  // Max backward cache size in MB

	init(
		url: URL,
		headers: [String: String]? = nil,
		externalSubtitles: [String]? = nil,
		startPosition: Double? = nil,
		autoplay: Bool = true,
		initialSubtitleId: Int? = nil,
		initialAudioId: Int? = nil,
		cacheEnabled: String? = nil,
		cacheSeconds: Int? = nil,
		demuxerMaxBytes: Int? = nil,
		demuxerMaxBackBytes: Int? = nil
	) {
		self.url = url
		self.headers = headers
		self.externalSubtitles = externalSubtitles
		self.startPosition = startPosition
		self.autoplay = autoplay
		self.initialSubtitleId = initialSubtitleId
		self.initialAudioId = initialAudioId
		self.cacheEnabled = cacheEnabled
		self.cacheSeconds = cacheSeconds
		self.demuxerMaxBytes = demuxerMaxBytes
		self.demuxerMaxBackBytes = demuxerMaxBackBytes
	}
}

// This view will be used as a native component. Make sure to inherit from `ExpoView`
// to apply the proper styling (e.g. border radius and shadows).
class MpvPlayerView: ExpoView {
	private let displayLayer = AVSampleBufferDisplayLayer()
	private var renderer: MPVLayerRenderer?
	private var videoContainer: UIView!
	private var pipController: PiPController?
	let onLoad = EventDispatcher()
	let onPlaybackStateChange = EventDispatcher()
	let onProgress = EventDispatcher()
	let onError = EventDispatcher()
	let onTracksReady = EventDispatcher()

	private var currentURL: URL?
	private var cachedPosition: Double = 0
	private var cachedDuration: Double = 0
	private var intendedPlayState: Bool = false
	private var _isZoomedToFill: Bool = false
	private var appStateObserver: NSObjectProtocol?
	
	// Reference to now playing manager
	private let nowPlayingManager = MPVNowPlayingManager.shared

	required init(appContext: AppContext? = nil) {
		super.init(appContext: appContext)
		setupNotifications()
		setupView()
	}

	private func setupView() {
		clipsToBounds = true
		backgroundColor = .black
		configureAudioSession()

		videoContainer = UIView()
		videoContainer.translatesAutoresizingMaskIntoConstraints = false
		videoContainer.backgroundColor = .black
		videoContainer.clipsToBounds = true
		addSubview(videoContainer)

		displayLayer.frame = bounds
		displayLayer.videoGravity = .resizeAspect
		#if !os(tvOS)
		if #available(iOS 17.0, *) {
			displayLayer.wantsExtendedDynamicRangeContent = true
		}
		#endif
		displayLayer.backgroundColor = UIColor.black.cgColor
		videoContainer.layer.addSublayer(displayLayer)

		NSLayoutConstraint.activate([
			videoContainer.topAnchor.constraint(equalTo: topAnchor),
			videoContainer.leadingAnchor.constraint(equalTo: leadingAnchor),
			videoContainer.trailingAnchor.constraint(equalTo: trailingAnchor),
			videoContainer.bottomAnchor.constraint(equalTo: bottomAnchor)
		])

		renderer = MPVLayerRenderer(displayLayer: displayLayer)
		renderer?.delegate = self

		// Setup PiP
		pipController = PiPController(sampleBufferDisplayLayer: displayLayer)
		pipController?.delegate = self

		do {
			try renderer?.start()
		} catch {
			onError(["error": "Failed to start renderer: \(error.localizedDescription)"])
		}

		// Pause playback when app enters background on tvOS
		#if os(tvOS)
		appStateObserver = NotificationCenter.default.addObserver(
			forName: UIApplication.didEnterBackgroundNotification,
			object: nil,
			queue: .main
		) { [weak self] _ in
			self?.pause()
		}
		#endif
	}

	override func layoutSubviews() {
		super.layoutSubviews()
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		displayLayer.frame = videoContainer.bounds
		displayLayer.isHidden = false
		displayLayer.opacity = 1.0
		CATransaction.commit()
	}

	private func configureAudioSession() {
		let audioSession = AVAudioSession.sharedInstance()
		do {
			try audioSession.setCategory(
				.playback,
				mode: .moviePlayback,
				policy: .longFormAudio,
				options: []
			)
			try audioSession.setActive(true)
		} catch {
			print("Failed to configure audio session: \(error)")
		}
	// MARK: - Audio Session & Notifications

	private func setupNotifications() {
		// Handle audio session interruptions (e.g., incoming calls, other apps playing audio)
		NotificationCenter.default.addObserver(
			self, selector: #selector(handleAudioSessionInterruption),
			name: AVAudioSession.interruptionNotification, object: nil)
	}

	@objc func handleAudioSessionInterruption(_ notification: Notification) {
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

	func loadVideo(config: VideoLoadConfig) {
		// Skip reload if same URL is already playing
		if currentURL == config.url {
			return
		}
		currentURL = config.url

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

		onLoad(["url": config.url.absoluteString])
	}
	
	// Convenience method for simple loads
	func loadVideo(url: URL, headers: [String: String]? = nil) {
		loadVideo(config: VideoLoadConfig(url: url, headers: headers))
	}

	func play() {
		intendedPlayState = true
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

	func startPictureInPicture() {
		print("🎬 MpvPlayerView: startPictureInPicture called")
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

	deinit {
		if let observer = appStateObserver {
			NotificationCenter.default.removeObserver(observer)
		}
		#if os(tvOS)
		resetDisplayCriteria()
		#endif
		pipController?.stopPictureInPicture()
		renderer?.stop()
		displayLayer.removeFromSuperlayer()
		clearNowPlayingInfo()
		NotificationCenter.default.removeObserver(self)
	}
}

// MARK: - MPVLayerRendererDelegate

extension MpvPlayerView: MPVLayerRendererDelegate {
	
	// MARK: - Single location for Now Playing updates
	private func syncNowPlaying(isPlaying: Bool) {
		print("[MPV] syncNowPlaying: pos=\(Int(cachedPosition))s, dur=\(Int(cachedDuration))s, playing=\(isPlaying)")
		nowPlayingManager.updatePlayback(position: cachedPosition, duration: cachedDuration, isPlaying: isPlaying)
	}
	
	func renderer(_: MPVLayerRenderer, didUpdatePosition position: Double, duration: Double, cacheSeconds: Double) {
		cachedPosition = position
		cachedDuration = duration
		
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }

			if self.pipController?.isPictureInPictureActive == true {
				self.pipController?.setCurrentTimeFromSeconds(position, duration: duration)
			}

			self.onProgress([
				"position": position,
				"duration": duration,
				"progress": duration > 0 ? position / duration : 0,
				"cacheSeconds": cacheSeconds,
			])
		}
	}

	func renderer(_: MPVLayerRenderer, didChangePause isPaused: Bool) {
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }
			
			print("[MPV] didChangePause: isPaused=\(isPaused), cachedDuration=\(self.cachedDuration)")
			self.pipController?.setPlaybackRate(isPaused ? 0.0 : 1.0)
			self.syncNowPlaying(isPlaying: !isPaused)
			self.onPlaybackStateChange([
				"isPaused": isPaused,
				"isPlaying": !isPaused,
			])
		}
	}

	func renderer(_: MPVLayerRenderer, didChangeLoading isLoading: Bool) {
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }
			self.onPlaybackStateChange([
				"isLoading": isLoading,
			])
		}
	}

	func renderer(_: MPVLayerRenderer, didBecomeReadyToSeek: Bool) {
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }
			self.onPlaybackStateChange([
				"isReadyToSeek": didBecomeReadyToSeek,
			])
		}
	}
	
	func renderer(_: MPVLayerRenderer, didBecomeTracksReady: Bool) {
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }
			self.onTracksReady([:])
		}
	}

	func renderer(_: MPVLayerRenderer, didDetectHDRMode mode: HDRMode, fps: Double, didSelectAudioOutput audioOutput: String) {
		#if os(tvOS)
		setDisplayCriteria(for: mode, fps: Float(fps))
		#endif
		// Audio output is now active - this is the right time to activate audio session and set Now Playing
		print("[MPV] Audio output ready (\(audioOutput)), activating audio session and syncing Now Playing")
		nowPlayingManager.activateAudioSession()
		syncNowPlaying(isPlaying: !isPaused())
	}
}

// MARK: - tvOS HDR Display Criteria

#if os(tvOS)
import AVKit
import CoreMedia

extension MpvPlayerView {
	/// Creates a CMFormatDescription with HDR metadata for display criteria
	private func createHDRFormatDescription(hdrMode: HDRMode) -> CMFormatDescription? {
		var formatDescription: CMFormatDescription?

		// Build extensions dictionary for HDR color properties
		var extensions: [String: Any] = [
			kCMFormatDescriptionExtension_FullRangeVideo as String: true
		]

		switch hdrMode {
		case .hdr10, .dolbyVision:
			// HDR10 and Dolby Vision use BT.2020 primaries with PQ transfer function
			extensions[kCMFormatDescriptionExtension_ColorPrimaries as String] = kCMFormatDescriptionColorPrimaries_ITU_R_2020
			extensions[kCMFormatDescriptionExtension_TransferFunction as String] = kCMFormatDescriptionTransferFunction_SMPTE_ST_2084_PQ
			extensions[kCMFormatDescriptionExtension_YCbCrMatrix as String] = kCMFormatDescriptionYCbCrMatrix_ITU_R_2020
		case .hlg:
			// HLG uses BT.2020 primaries with HLG transfer function
			extensions[kCMFormatDescriptionExtension_ColorPrimaries as String] = kCMFormatDescriptionColorPrimaries_ITU_R_2020
			extensions[kCMFormatDescriptionExtension_TransferFunction as String] = kCMFormatDescriptionTransferFunction_ITU_R_2100_HLG
			extensions[kCMFormatDescriptionExtension_YCbCrMatrix as String] = kCMFormatDescriptionYCbCrMatrix_ITU_R_2020
		case .sdr:
			return nil
		}

		// Create a video format description with HDR extensions
		// Using HEVC codec type and 4K resolution as typical HDR parameters
		let status = CMVideoFormatDescriptionCreate(
			allocator: kCFAllocatorDefault,
			codecType: kCMVideoCodecType_HEVC,
			width: 3840,
			height: 2160,
			extensions: extensions as CFDictionary,
			formatDescriptionOut: &formatDescription
		)

		return status == noErr ? formatDescription : nil
	}

	/// Sets the preferred display criteria for HDR content on tvOS
	func setDisplayCriteria(for hdrMode: HDRMode, fps: Float) {
		guard #available(tvOS 17.0, *) else {
			print("🎬 HDR: AVDisplayCriteria requires tvOS 17.0+")
			return
		}

		guard let window = self.window else {
			print("🎬 HDR: No window available for display criteria")
			return
		}

		let manager = window.avDisplayManager

		if hdrMode == .sdr {
			print("🎬 HDR: Setting display criteria to SDR (nil)")
			manager.preferredDisplayCriteria = nil
			return
		}

		guard let formatDescription = createHDRFormatDescription(hdrMode: hdrMode) else {
			print("🎬 HDR: Failed to create format description for \(hdrMode)")
			return
		}

		print("🎬 HDR: Setting display criteria to \(hdrMode), fps: \(fps)")
		manager.preferredDisplayCriteria = AVDisplayCriteria(
			refreshRate: fps,
			formatDescription: formatDescription
		)
	}

	/// Resets display criteria when playback ends
	func resetDisplayCriteria() {
		guard #available(tvOS 17.0, *) else { return }
		guard let window = self.window else { return }
		print("🎬 HDR: Resetting display criteria")
		window.avDisplayManager.preferredDisplayCriteria = nil
	}
}
#endif

// MARK: - PiPControllerDelegate

extension MpvPlayerView: PiPControllerDelegate {
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
