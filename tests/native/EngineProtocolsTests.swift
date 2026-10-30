import AVFoundation
import Foundation

// A remote engine carries transport and queue, never a display layer: this double compiles
// against the two protocols only, which is the whole point of the split.
final class RemoteOnlyEngine: TransportEngine, QueueEngine {
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

		print("PASS: transport, rendering and queue faces, queue defaults, delegate play and seek defaults")
	}
}
