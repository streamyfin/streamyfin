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
	var loop: Bool
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
		loop: Bool = false,
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
		self.loop = loop
		self.cacheEnabled = cacheEnabled
		self.cacheSeconds = cacheSeconds
		self.demuxerMaxBytes = demuxerMaxBytes
		self.demuxerMaxBackBytes = demuxerMaxBackBytes
	}
}

// This view will be used as a native component. Make sure to inherit from `ExpoView`
// to apply the proper styling (e.g. border radius and shadows).
//
// The view is a thin host over MPVPlayerEngine (PlayerEngine.swift), which owns
// the display layer, renderer, PiP, Now Playing and the audio session. The
// presented native player (NativePlayer/) shares the same engine; this view's
// job is only RN embedding: layer hosting, layout, and mapping engine delegate
// callbacks 1:1 onto the JS EventDispatchers.
class MpvPlayerView: ExpoView {
	private let engine = MPVPlayerEngine()
	private var videoContainer: UIView!
	let onLoad = EventDispatcher()
	let onPlaybackStateChange = EventDispatcher()
	let onProgress = EventDispatcher()
	let onError = EventDispatcher()
	let onTracksReady = EventDispatcher()
	let onPictureInPictureChange = EventDispatcher()

	private var appStateObserver: NSObjectProtocol?

	required init(appContext: AppContext? = nil) {
		super.init(appContext: appContext)
		setupView()
	}

	private func setupView() {
		clipsToBounds = true
		backgroundColor = .black

		videoContainer = UIView()
		videoContainer.translatesAutoresizingMaskIntoConstraints = false
		videoContainer.backgroundColor = .black
		videoContainer.clipsToBounds = true
		addSubview(videoContainer)

		engine.delegate = self
		engine.displayLayer.frame = bounds
		engine.displayLayer.contentsScale = contentScaleFactor
		videoContainer.layer.addSublayer(engine.displayLayer)

		NSLayoutConstraint.activate([
			videoContainer.topAnchor.constraint(equalTo: topAnchor),
			videoContainer.leadingAnchor.constraint(equalTo: leadingAnchor),
			videoContainer.trailingAnchor.constraint(equalTo: trailingAnchor),
			videoContainer.bottomAnchor.constraint(equalTo: bottomAnchor)
		])

		do {
			try engine.start()
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
		engine.displayLayer.frame = videoContainer.bounds
		engine.displayLayer.contentsScale = contentScaleFactor
		engine.displayLayer.isHidden = false
		engine.displayLayer.opacity = 1.0
		CATransaction.commit()
	}

	// MARK: - Now Playing Info

	func setNowPlayingMetadata(_ metadata: [String: String]) {
		engine.setNowPlayingMetadata(metadata)
	}

	func loadVideo(config: VideoLoadConfig) {
		engine.loadVideo(config: config)
	}

	// Convenience method for simple loads
	func loadVideo(url: URL, headers: [String: String]? = nil) {
		loadVideo(config: VideoLoadConfig(url: url, headers: headers))
	}

	func play() {
		engine.play()
	}

	func pause() {
		engine.pause()
	}

	/// Synchronously stop and destroy the mpv instance + decoder before the
	/// next screen mounts. See MPVPlayerEngine.destroy() for the full
	/// remount/restart rationale.
	func destroy() {
		engine.destroy()
	}

	func seekTo(position: Double) {
		engine.seekTo(position: position)
	}

	func seekBy(offset: Double) {
		engine.seekBy(offset: offset)
	}

	func setSpeed(speed: Double) {
		engine.setSpeed(speed: speed)
	}

	func getSpeed() -> Double {
		return engine.getSpeed()
	}

	func isPaused() -> Bool {
		return engine.isPaused()
	}

	func getCurrentPosition() -> Double {
		return engine.getCurrentPosition()
	}

	func getDuration() -> Double {
		return engine.getDuration()
	}

	// MARK: - Picture in Picture

	func startPictureInPicture() {
		engine.startPictureInPicture()
	}

	func stopPictureInPicture() {
		engine.stopPictureInPicture()
	}

	func isPictureInPictureSupported() -> Bool {
		return engine.isPictureInPictureSupported()
	}

	func isPictureInPictureActive() -> Bool {
		return engine.isPictureInPictureActive()
	}

	// MARK: - Subtitle Controls

	func getSubtitleTracks() -> [[String: Any]] {
		return engine.getSubtitleTracks()
	}

	func setSubtitleTrack(_ trackId: Int) {
		engine.setSubtitleTrack(trackId)
	}

	func disableSubtitles() {
		engine.disableSubtitles()
	}

	func getCurrentSubtitleTrack() -> Int {
		return engine.getCurrentSubtitleTrack()
	}

	func addSubtitleFile(url: String, select: Bool = true) {
		engine.addSubtitleFile(url: url, select: select)
	}

	// MARK: - Audio Track Controls

	func getAudioTracks() -> [[String: Any]] {
		return engine.getAudioTracks()
	}

	func setAudioTrack(_ trackId: Int) {
		engine.setAudioTrack(trackId)
	}

	func getCurrentAudioTrack() -> Int {
		return engine.getCurrentAudioTrack()
	}

	// MARK: - Subtitle Positioning

	func setSubtitlePosition(_ position: Int) {
		engine.setSubtitlePosition(position)
	}

	func setSubtitleScale(_ scale: Double) {
		engine.setSubtitleScale(scale)
	}

	func setSubtitleDelay(_ seconds: Double) {
		engine.setSubtitleDelay(seconds)
	}

	func setSubtitleMarginY(_ margin: Int) {
		engine.setSubtitleMarginY(margin)
	}

	func setSubtitleAlignX(_ alignment: String) {
		engine.setSubtitleAlignX(alignment)
	}

	func setSubtitleAlignY(_ alignment: String) {
		engine.setSubtitleAlignY(alignment)
	}

	func setSubtitleFontSize(_ size: Int) {
		engine.setSubtitleFontSize(size)
	}

	func setSubtitleStyle(config: [String: Any]) {
		engine.setSubtitleStyle(config: config)
	}

	func setSubtitleBackgroundColor(_ color: String) {
		engine.setSubtitleBackgroundColor(color)
	}

	func setSubtitleBorderStyle(_ style: String) {
		engine.setSubtitleBorderStyle(style)
	}

	func setSubtitleAssOverride(_ mode: String) {
		engine.setSubtitleAssOverride(mode)
	}

	// MARK: - Video Scaling

	func setZoomedToFill(_ zoomed: Bool) {
		engine.setZoomedToFill(zoomed)
	}

	func isZoomedToFill() -> Bool {
		return engine.isZoomedToFill()
	}

	// MARK: - Technical Info

	func getTechnicalInfo() -> [String: Any] {
		return engine.getTechnicalInfo()
	}

	deinit {
		if let observer = appStateObserver {
			NotificationCenter.default.removeObserver(observer)
		}
		#if os(tvOS)
		resetDisplayCriteria()
		#endif
		engine.shutdown()
	}
}

// MARK: - MPVPlayerEngineDelegate

extension MpvPlayerView: MPVPlayerEngineDelegate {
	func engine(_ engine: MPVPlayerEngine, didLoad url: URL) {
		onLoad(["url": url.absoluteString])
	}

	func engine(_ engine: MPVPlayerEngine, didUpdateProgress position: Double, duration: Double, cacheSeconds: Double) {
		onProgress([
			"position": position,
			"duration": duration,
			"progress": duration > 0 ? position / duration : 0,
			"cacheSeconds": cacheSeconds,
		])
	}

	func engine(_ engine: MPVPlayerEngine, didChangePause isPaused: Bool) {
		onPlaybackStateChange([
			"isPaused": isPaused,
			"isPlaying": !isPaused,
		])
	}

	func engine(_ engine: MPVPlayerEngine, didChangeLoading isLoading: Bool) {
		onPlaybackStateChange([
			"isLoading": isLoading,
		])
	}

	func engine(_ engine: MPVPlayerEngine, didBecomeReadyToSeek ready: Bool) {
		onPlaybackStateChange([
			"isReadyToSeek": ready,
		])
	}

	func engine(_ engine: MPVPlayerEngine, didBecomeTracksReady ready: Bool) {
		onTracksReady([:])
	}

	func engine(_ engine: MPVPlayerEngine, didChangePictureInPicture isActive: Bool) {
		onPictureInPictureChange(["isActive": isActive])
	}

	func engine(_ engine: MPVPlayerEngine, didFailWithError message: String) {
		onError(["error": message])
	}

	func engine(_ engine: MPVPlayerEngine, didDetectHDRMode mode: HDRMode, fps: Double) {
		#if os(tvOS)
		setDisplayCriteria(for: mode, fps: Float(fps))
		#endif
	}

	func engineDidReachEnd(_ engine: MPVPlayerEngine) {
		// EOF is only consumed by the presented native player (auto-advance /
		// auto-close). The RN-embedded player's JS layer derives end-of-video
		// from onProgress, so this is intentionally a no-op here.
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
