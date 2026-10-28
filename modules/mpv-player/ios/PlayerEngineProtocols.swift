import AVFoundation
import Foundation

/// Configuration for loading a video.
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

/// HDR mode detected from video properties
enum HDRMode {
	case sdr
	case hdr10
	case dolbyVision
	case hlg
}

/// Engine → host callbacks, the same set for every engine. All callbacks arrive on
/// the main thread. Typed on the transport face: a remote engine reports the same
/// progress, pause and loading changes as a local decoder, with no layer behind them.
protocol PlayerEngineDelegate: AnyObject {
	func engine(_ engine: TransportEngine, didLoad config: VideoLoadConfig)
	func engine(_ engine: TransportEngine, didUpdateProgress position: Double, duration: Double, cacheSeconds: Double)
	func engine(_ engine: TransportEngine, didChangePause isPaused: Bool)
	func engine(_ engine: TransportEngine, didChangeLoading isLoading: Bool)
	func engine(_ engine: TransportEngine, didBecomeReadyToSeek ready: Bool)
	func engine(_ engine: TransportEngine, didBecomeTracksReady ready: Bool)
	func engine(_ engine: TransportEngine, didChangePictureInPicture isActive: Bool)
	func engine(_ engine: TransportEngine, didFailWithError message: String)
	func engine(_ engine: TransportEngine, didDetectHDRMode mode: HDRMode, fps: Double)
	func engineDidReachEnd(_ engine: TransportEngine)
	/// Seeks the engine receives from the system — lock screen, Control
	/// Center, PiP. A host that keeps its own position bookkeeping performs
	/// the seek itself so it is treated like every other seek; the engine only
	/// forwards the request.
	func engine(_ engine: TransportEngine, requestsSeekTo position: Double)
	func engine(_ engine: TransportEngine, requestsSeekBy offset: Double)
	func engine(_ engine: TransportEngine, requestsPlaying playing: Bool)
}

/// Hosts without position bookkeeping of their own let the engine seek.
extension PlayerEngineDelegate {
	func engine(_ engine: TransportEngine, requestsPlaying playing: Bool) {
		if playing { engine.play() } else { engine.pause() }
	}
	func engine(_ engine: TransportEngine, requestsSeekTo position: Double) {
		engine.seekTo(position: position)
	}

	func engine(_ engine: TransportEngine, requestsSeekBy offset: Double) {
		engine.seekBy(offset: offset)
	}
}

/// The face of an engine every host talks to: playback, seeking, speed, tracks, state
/// and events. A local decoder and a remote target both carry it; what needs a screen
/// lives in `RenderingEngine`.
protocol TransportEngine: AnyObject {
	var delegate: PlayerEngineDelegate? { get set }
	var intendedPlayState: Bool { get }

	func start() throws
	func loadVideo(config: VideoLoadConfig, force: Bool)
	func play()
	func pause()
	func destroy()
	func shutdown()

	func seekTo(position: Double, exact: Bool)
	func seekBy(offset: Double)
	func requestSeek(to position: Double)
	func requestPlaying(_ playing: Bool)
	func requestSeek(by offset: Double)
	func setSpeed(speed: Double)
	func setMute(_ muted: Bool)
	func getSpeed() -> Double
	func isPaused() -> Bool
	func getCurrentPosition() -> Double
	func getDuration() -> Double
	func setNowPlayingMetadata(_ metadata: [String: String], artworkHeaders: [String: String]?)

	func getSubtitleTracks(completion: @escaping ([[String: Any]]) -> Void)
	func setSubtitleTrack(_ trackId: Int)
	func disableSubtitles()
	func getCurrentSubtitleTrack(completion: @escaping (Int) -> Void)
	func addSubtitleFile(url: String, select: Bool)
	func getAudioTracks(completion: @escaping ([[String: Any]]) -> Void)
	func setAudioTrack(_ trackId: Int)
	func getCurrentAudioTrack(completion: @escaping (Int) -> Void)

	func setAudioDelay(_ seconds: Double)
	func setVolumeBoost(_ percent: Int)
	func setDialogueBoost(_ enabled: Bool)
	func setMonoDownmix(_ enabled: Bool)
}

/// The defaults the concrete engine used to carry as default arguments: a protocol
/// requirement cannot, so the hosts keep their short calls here.
extension TransportEngine {
	func loadVideo(config: VideoLoadConfig) { loadVideo(config: config, force: false) }
	func seekTo(position: Double) { seekTo(position: position, exact: false) }
	func addSubtitleFile(url: String) { addSubtitleFile(url: url, select: true) }
	func setNowPlayingMetadata(_ metadata: [String: String]) { setNowPlayingMetadata(metadata, artworkHeaders: nil) }
}

/// The face of an engine that draws on this device: the display layer, picture in
/// picture, zoom, subtitle rendering and the technical readout. A remote target has
/// none of it, and the chrome in remote mode never asks for it.
protocol RenderingEngine: AnyObject {
	var displayLayer: AVSampleBufferDisplayLayer { get }
	var pictureInPictureStopIsRestore: Bool { get }
	var isPictureInPictureStopping: Bool { get }
	var isPictureInPictureStarting: Bool { get }

	func syncSubtitleLayerFrame()
	func setPictureInPictureAutoStartEnabled(_ enabled: Bool)
	func setPictureInPictureHostVisible(_ visible: Bool)
	func startPictureInPicture()
	func stopPictureInPicture()
	func isPictureInPictureSupported() -> Bool
	func isPictureInPictureActive() -> Bool

	func setSubtitlePosition(_ position: Int)
	func setSubtitleScale(_ scale: Double)
	func setSubtitleDelay(_ seconds: Double)
	func setSubtitleMarginY(_ margin: Int)
	func setSubtitleAlignX(_ alignment: String)
	func setSubtitleAlignY(_ alignment: String)
	func setSubtitleFontSize(_ size: Int)
	func setSubtitleStyle(config: [String: Any])
	func setSubtitleBackgroundColor(_ color: String)
	func setSubtitleBorderStyle(_ style: String)
	func setSubtitleAssOverride(_ mode: String)

	func setZoomedToFill(_ zoomed: Bool)
	func isZoomedToFill() -> Bool
	func getTechnicalInfo(completion: @escaping ([String: Any]) -> Void)
}

/// The face of an engine that plays a list on a target: the current item, the next and
/// previous ones, what gets added, and the target's own volume. The local engine plays
/// one item at a time and keeps every default; the Cast engine fills them in.
protocol QueueEngine: AnyObject {
	/// The id of the item the target is on, nil while nothing is loaded or unknown.
	var currentItemId: String? { get }
	/// The target's volume, 0 to 1, nil when the target has no volume of its own.
	var targetVolume: Double? { get }
	func skipToNext()
	func skipToPrevious()
	func enqueue(itemIds: [String])
	func setTargetVolume(_ level: Double)
}

extension QueueEngine {
	var currentItemId: String? { nil }
	var targetVolume: Double? { nil }
	func skipToNext() {}
	func skipToPrevious() {}
	func enqueue(itemIds: [String]) {}
	func setTargetVolume(_ level: Double) {}
}

/// A local engine: all three faces. A remote one is `TransportEngine & QueueEngine`.
typealias PlayerEngine = TransportEngine & RenderingEngine & QueueEngine
