import AVFoundation
import CoreMedia
import ExpoModulesCore
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
	
	init(
		url: URL,
		headers: [String: String]? = nil,
		externalSubtitles: [String]? = nil,
		startPosition: Double? = nil,
		autoplay: Bool = true,
		initialSubtitleId: Int? = nil,
		initialAudioId: Int? = nil
	) {
		self.url = url
		self.headers = headers
		self.externalSubtitles = externalSubtitles
		self.startPosition = startPosition
		self.autoplay = autoplay
		self.initialSubtitleId = initialSubtitleId
		self.initialAudioId = initialAudioId
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

	required init(appContext: AppContext? = nil) {
		super.init(appContext: appContext)
		setupView()
		// Note: Decoder reset is handled automatically via KVO in MPVLayerRenderer
	}

	private func setupView() {
		clipsToBounds = true
		backgroundColor = .black

		videoContainer = UIView()
		videoContainer.translatesAutoresizingMaskIntoConstraints = false
		videoContainer.backgroundColor = .black
		videoContainer.clipsToBounds = true
		addSubview(videoContainer)

		displayLayer.frame = bounds
		displayLayer.videoGravity = .resizeAspect
		if #available(iOS 17.0, *) {
			displayLayer.wantsExtendedDynamicRangeContent = true
		}
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
			initialAudioId: config.initialAudioId
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
		renderer?.seek(to: position)
	}

	func seekBy(offset: Double) {
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
		pipController?.stopPictureInPicture()
		renderer?.stop()
		displayLayer.removeFromSuperlayer()
	}
}

// MARK: - MPVLayerRendererDelegate

extension MpvPlayerView: MPVLayerRendererDelegate {
	func renderer(_: MPVLayerRenderer, didUpdatePosition position: Double, duration: Double, cacheSeconds: Double) {
		cachedPosition = position
		cachedDuration = duration
		
		DispatchQueue.main.async { [weak self] in
			guard let self else { return }
			// Update PiP current time for progress bar
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
			// Don't update intendedPlayState here - it's only set by user actions (play/pause)
			// This prevents PiP UI flicker during seeking
			
			// Sync timebase rate with actual playback state
			self.pipController?.setPlaybackRate(isPaused ? 0.0 : 1.0)
			
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
}

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
