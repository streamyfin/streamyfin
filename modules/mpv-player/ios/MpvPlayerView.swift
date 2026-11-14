import AVFoundation
import ExpoModulesCore
import UIKit

/// Configuration for loading a video
struct VideoLoadConfig {
	let url: URL
	/// The URL as JS asked for it. `url` is Foundation's parse of it, which can
	/// spell it differently (punycode hosts, percent encoding), so JS
	/// recognizes its own stream in onLoad only by this string.
	var requestedURL: String?
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
	/// A Live TV channel: the stream starts where it is, no seek to its start.
	var isLive = false

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

/// The embedded view, a thin host over MPVPlayerEngine (PlayerEngine.swift).
/// Only the subtitle preview in Settings uses it: a silent clip whose
/// subtitles follow the settings. The engine runs without background playback
/// here, so the view takes no audio session, lock screen controls or picture
/// in picture. The presented player (NativePlayer/) shares the engine.
class MpvPlayerView: ExpoView {
	private let engine = MPVPlayerEngine()
	private var videoContainer: UIView!
	let onTracksReady = EventDispatcher()

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
		// A clip shown in the app must not take the audio session or arm
		// picture in picture: the user's music stopped.
		engine.backgroundPlayback = false
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
			print("[MPV] Failed to start renderer: \(error.localizedDescription)")
		}
	}

	override func layoutSubviews() {
		super.layoutSubviews()
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		engine.displayLayer.frame = videoContainer.bounds
		engine.displayLayer.contentsScale = contentScaleFactor
		engine.displayLayer.isHidden = false
		engine.displayLayer.opacity = 1.0
		engine.syncSubtitleLayerFrame()
		CATransaction.commit()
	}

	func loadVideo(config: VideoLoadConfig) {
		engine.loadVideo(config: config)
	}

	// MARK: - Subtitle Style

	func setSubtitleScale(_ scale: Double) {
		engine.setSubtitleScale(scale)
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

	func setSubtitleStyle(config: [String: Any]) {
		engine.setSubtitleStyle(config: config)
	}

	func setSubtitleAssOverride(_ mode: String) {
		engine.setSubtitleAssOverride(mode)
	}

	deinit {
		engine.shutdown()
	}
}

// MARK: - MPVPlayerEngineDelegate

/// The preview only waits for its tracks before styling the subtitles.
extension MpvPlayerView: MPVPlayerEngineDelegate {
	func engine(_ engine: MPVPlayerEngine, didLoad config: VideoLoadConfig) {}
	func engine(_ engine: MPVPlayerEngine, didUpdateProgress position: Double, duration: Double, cacheSeconds: Double) {}
	func engine(_ engine: MPVPlayerEngine, didChangePause isPaused: Bool) {}
	func engine(_ engine: MPVPlayerEngine, didChangeLoading isLoading: Bool) {}
	func engine(_ engine: MPVPlayerEngine, didBecomeReadyToSeek ready: Bool) {}

	func engine(_ engine: MPVPlayerEngine, didBecomeTracksReady ready: Bool) {
		onTracksReady([:])
	}

	func engine(_ engine: MPVPlayerEngine, didChangePictureInPicture isActive: Bool) {}

	func engine(_ engine: MPVPlayerEngine, didFailWithError message: String) {
		print("[MPV] Subtitle preview failed: \(message)")
	}

	func engine(_ engine: MPVPlayerEngine, didDetectHDRMode mode: HDRMode, fps: Double) {}
	func engineDidReachEnd(_ engine: MPVPlayerEngine) {}
}
