import AVFoundation
import Foundation

// A remote engine carries transport and queue, never a display layer: this double compiles
// against the two protocols only, which is the whole point of the split.
class RemoteOnlyEngine: TransportEngine, QueueEngine {
	weak var delegate: PlayerEngineDelegate?
	private(set) var intendedPlayState = false
	var played = 0
	var seeksTo: [(position: Double, exact: Bool)] = []
	var seeksBy: [Double] = []

	func start() throws {}
	func loadVideo(config: VideoLoadConfig, force: Bool) {}
	func play() { played += 1; intendedPlayState = true }
	func pause() { intendedPlayState = false }
	func destroy() {}
	func shutdown() {}
	func seekTo(position: Double, exact: Bool) { seeksTo.append((position, exact)) }
	func seekBy(offset: Double) { seeksBy.append(offset) }
	func requestSeek(to position: Double) {}
	func requestPlaying(_ playing: Bool) {}
	func requestSeek(by offset: Double) {}
	func setSpeed(speed: Double) {}
	func setMute(_ muted: Bool) {}
	func getSpeed() -> Double { 1 }
	func isPaused() -> Bool { !intendedPlayState }
	func getCurrentPosition() -> Double { 0 }
	func getDuration() -> Double { 0 }
	func setNowPlayingMetadata(_ metadata: [String: String], artworkHeaders: [String: String]?) {}
	func setSkipIntervals(forward: Double, backward: Double) {}
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
}

// A local engine: the remote double plus a screen, which answers the chrome's rendering questions.
final class LocalEngine: RemoteOnlyEngine, RenderingEngine {
	let displayLayer = AVSampleBufferDisplayLayer()
	let pictureInPictureStopIsRestore = false
	let isPictureInPictureStopping = false
	let isPictureInPictureStarting = false
	var supportsPictureInPicture = true

	func syncSubtitleLayerFrame() {}
	func setPictureInPictureAutoStartEnabled(_ enabled: Bool) {}
	func setPictureInPictureHostVisible(_ visible: Bool) {}
	func startPictureInPicture() {}
	func stopPictureInPicture() {}
	func isPictureInPictureSupported() -> Bool { supportsPictureInPicture }
	func isPictureInPictureActive() -> Bool { false }
	func setSubtitlePosition(_ position: Int) {}
	func setSubtitleScale(_ scale: Double) {}
	func setSubtitleDelay(_ seconds: Double) {}
	func setSubtitleMarginY(_ margin: Int) {}
	func setSubtitleAlignX(_ alignment: String) {}
	func setSubtitleAlignY(_ alignment: String) {}
	func setSubtitleFontSize(_ size: Int) {}
	func setSubtitleStyle(config: [String: Any]) {}
	func setSubtitleBackgroundColor(_ color: String) {}
	func setSubtitleBorderStyle(_ style: String) {}
	func setSubtitleAssOverride(_ mode: String) {}
	func setZoomedToFill(_ zoomed: Bool) {}
	func isZoomedToFill() -> Bool { false }
	func getTechnicalInfo(completion: @escaping ([String: Any]) -> Void) { completion(["videoCodec": "h264"]) }
}

// A host that keeps no position bookkeeping lets the engine seek: the delegate's defaults.
final class RecordingHost: PlayerEngineDelegate {
	func engine(_ engine: TransportEngine, didLoad config: VideoLoadConfig) {}
	func engine(_ engine: TransportEngine, didUpdateProgress position: Double, duration: Double, cacheSeconds: Double) {}
	func engine(_ engine: TransportEngine, didChangePause isPaused: Bool) {}
	func engine(_ engine: TransportEngine, didChangeLoading isLoading: Bool) {}
	func engine(_ engine: TransportEngine, didBecomeReadyToSeek ready: Bool) {}
	func engine(_ engine: TransportEngine, didBecomeTracksReady ready: Bool) {}
	func engine(_ engine: TransportEngine, didChangePictureInPicture isActive: Bool) {}
	func engine(_ engine: TransportEngine, didFailWithError message: String) {}
	func engine(_ engine: TransportEngine, didDetectHDRMode mode: HDRMode, fps: Double) {}
	func engineDidReachEnd(_ engine: TransportEngine) {}
}

@main
enum EngineProtocolsTests {
	static func main() throws {
		let engine = RemoteOnlyEngine()
		let host = RecordingHost()
		engine.delegate = host

		engine.play()
		precondition(engine.played == 1)
		precondition(engine.isPaused() == false)
		precondition((engine as AnyObject) is RenderingEngine == false, "a remote engine must not carry the rendering face")

		// What the chrome holds: the remote double is a ChromeEngine, and so is any local engine.
		let chrome: ChromeEngine = engine
		precondition(chrome as? RenderingEngine == nil, "the chrome reaches rendering only through a cast")
		let widen: (PlayerEngine) -> ChromeEngine = { $0 }
		precondition(widen(LocalEngine()) as? RenderingEngine != nil, "a local engine keeps its screen once widened")

		// The chrome's two rendering questions. An engine without a screen offers no picture in
		// picture and answers the technical info with an empty table, so the overlay and the JS
		// promise still get an answer; a local engine gives its own.
		precondition(pictureInPictureSupported(by: engine) == false)
		precondition(pictureInPictureSupported(by: nil) == false)
		precondition(pictureInPictureSupported(by: LocalEngine()) == true)
		let noPictureInPicture = LocalEngine()
		noPictureInPicture.supportsPictureInPicture = false
		precondition(pictureInPictureSupported(by: noPictureInPicture) == false)
		var remoteInfo: [String: Any]?
		readTechnicalInfo(from: engine) { remoteInfo = $0 }
		precondition(remoteInfo?.isEmpty == true, "an engine without a screen must still answer, with nothing")
		var noEngineInfo: [String: Any]?
		readTechnicalInfo(from: nil) { noEngineInfo = $0 }
		precondition(noEngineInfo?.isEmpty == true)
		var localInfo: [String: Any]?
		readTechnicalInfo(from: LocalEngine()) { localInfo = $0 }
		precondition(localInfo?["videoCodec"] as? String == "h264")

		// The queue has nothing by default: the local engines never answer it.
		precondition(engine.currentItemId == nil)
		precondition(engine.targetVolume == nil)
		engine.skipToNext()
		engine.enqueue(itemIds: ["a"])
		precondition(engine.currentItemId == nil)

		// The delegate's default for a play request drives the engine.
		host.engine(engine, requestsPlaying: false)
		precondition(engine.isPaused() == true)

		// So do its seek defaults: the lock screen, Control Center and picture in picture reach
		// the RN-embedded player through them, an absolute seek and a relative one.
		host.engine(engine, requestsSeekTo: 12)
		host.engine(engine, requestsSeekBy: -10)
		precondition(engine.seeksTo.count == 1 && engine.seeksTo[0].position == 12 && engine.seeksTo[0].exact == false)
		precondition(engine.seeksBy == [-10])

		// An engine changes speed unless it says otherwise, and one without a screen here is remote.
		precondition(engine.canChangeSpeed, "an engine changes speed unless it says otherwise")
		precondition(isRemoteEngine(engine), "an engine without a screen here is remote")
		precondition(!isRemoteEngine(LocalEngine()))
		precondition(!isRemoteEngine(nil))

		print("PASS: transport, rendering and queue faces, the chrome engine, its rendering questions, queue defaults, delegate play and seek defaults, speed and remote defaults")
	}
}
