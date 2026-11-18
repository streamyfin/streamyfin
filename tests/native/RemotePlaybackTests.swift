import Foundation

// The holder keeps the Cast engine with the session, not with a screen, the cases of RemotePlaybackTest.kt
// under the same names: born with a session and a server, alive through a suspension and a closed screen,
// gone with the session or the account, sending nothing.

/// The fake TV, with every call that could reach a real one written down.
final class RecordingRemoteEngine: RemoteEngine {
	let inner: FakeRemoteEngine
	private(set) var calls: [String] = []
	/// What reached the TV: everything but binding to it and letting go of it.
	var sent: [String] { calls.filter { $0 != "start" && $0 != "shutdown" } }

	init(_ inner: FakeRemoteEngine) { self.inner = inner }

	var delegate: PlayerEngineDelegate? {
		get { inner.delegate }
		set { inner.delegate = newValue }
	}
	var onStateChanged: (() -> Void)? {
		get { inner.onStateChanged }
		set { inner.onStateChanged = newValue }
	}
	var phase: RemotePhase { inner.phase }
	var reconnecting: Bool { inner.reconnecting }
	var queueItemIds: [String] { inner.queueItemIds }
	var playingIndex: Int { inner.playingIndex }
	var foreign: Bool { inner.foreign }
	var mediaTitle: String? { inner.mediaTitle }
	var mediaImageUrl: String? { inner.mediaImageUrl }
	var playMethod: String? { inner.playMethod }
	var currentItemId: String? { inner.currentItemId }
	var targetVolume: Double? { inner.targetVolume }
	var intendedPlayState: Bool { inner.intendedPlayState }
	var canChangeSpeed: Bool { inner.canChangeSpeed }

	func start() throws {
		calls.append("start")
		try inner.start()
	}
	func shutdown() {
		calls.append("shutdown")
		inner.shutdown()
	}
	func destroy() { calls.append("destroy"); inner.destroy() }
	func loadVideo(config: VideoLoadConfig, force: Bool) { calls.append("loadVideo") }
	func play() { calls.append("play"); inner.play() }
	func pause() { calls.append("pause"); inner.pause() }
	func seekTo(position: Double, exact: Bool) { calls.append("seekTo"); inner.seekTo(position: position, exact: exact) }
	func seekBy(offset: Double) { calls.append("seekBy"); inner.seekBy(offset: offset) }
	func requestSeek(to position: Double) { calls.append("requestSeekTo") }
	func requestPlaying(_ playing: Bool) { calls.append("requestPlaying") }
	func requestSeek(by offset: Double) { calls.append("requestSeekBy") }
	func setSpeed(speed: Double) { calls.append("setSpeed") }
	func setMute(_ muted: Bool) { calls.append("setMute") }
	func getSpeed() -> Double { 1 }
	func isPaused() -> Bool { inner.isPaused() }
	func getCurrentPosition() -> Double { inner.getCurrentPosition() }
	func getDuration() -> Double { inner.getDuration() }
	func setNowPlayingMetadata(_ metadata: [String: String], artworkHeaders: [String: String]?) {}
	func setSkipIntervals(forward: Double, backward: Double) {}
	func getSubtitleTracks(completion: @escaping ([[String: Any]]) -> Void) { completion([]) }
	func setSubtitleTrack(_ trackId: Int) { calls.append("setSubtitleTrack \(trackId)") }
	func disableSubtitles() { calls.append("disableSubtitles") }
	func getCurrentSubtitleTrack(completion: @escaping (Int) -> Void) { completion(-1) }
	func addSubtitleFile(url: String, select: Bool) {}
	func getAudioTracks(completion: @escaping ([[String: Any]]) -> Void) { completion([]) }
	func setAudioTrack(_ trackId: Int) { calls.append("setAudioTrack \(trackId)") }
	func getCurrentAudioTrack(completion: @escaping (Int) -> Void) { completion(-1) }
	func setAudioDelay(_ seconds: Double) {}
	func setVolumeBoost(_ percent: Int) {}
	func setDialogueBoost(_ enabled: Bool) {}
	func setMonoDownmix(_ enabled: Bool) {}
	func skipToNext() { calls.append("skipToNext"); inner.skipToNext() }
	func skipToPrevious() { calls.append("skipToPrevious"); inner.skipToPrevious() }
	func enqueue(itemIds: [String]) { calls.append("enqueue") }
	func setTargetVolume(_ level: Double) { calls.append("setTargetVolume") }

	/// The servers the engine was handed, the load's and the reload's included.
	private(set) var servers: [ReceiverServer] = []

	func useServer(_ server: ReceiverServer) {
		calls.append("useServer")
		servers.append(server)
		inner.useServer(server)
	}
	func load(server: ReceiverServer, request: ReceiverPlayRequest, completion: @escaping (CastLoadResult) -> Void) {
		calls.append("load")
		servers.append(server)
		inner.load(server: server, request: request, completion: completion)
	}
	/// The subtitle index each reload carried, nil for the one the TV plays.
	private(set) var reloadSubtitles: [Int?] = []
	func reloadCurrentItem(server: ReceiverServer, subtitleStreamIndex: Int?) {
		calls.append("reload")
		servers.append(server)
		reloadSubtitles.append(subtitleStreamIndex)
		inner.reloadCurrentItem(server: server, subtitleStreamIndex: subtitleStreamIndex)
	}
}

final class ScreenDelegate: PlayerEngineDelegate {
	var positions: [Double] = []
	var pauses: [Bool] = []
	var loadings: [Bool] = []
	var readyToSeek = 0

	func engine(_ engine: TransportEngine, didLoad config: VideoLoadConfig) {}
	func engine(_ engine: TransportEngine, didUpdateProgress position: Double, duration: Double, cacheSeconds: Double) {
		positions.append(position)
	}
	func engine(_ engine: TransportEngine, didChangePause isPaused: Bool) { pauses.append(isPaused) }
	func engine(_ engine: TransportEngine, didChangeLoading isLoading: Bool) { loadings.append(isLoading) }
	func engine(_ engine: TransportEngine, didBecomeReadyToSeek ready: Bool) { if ready { readyToSeek += 1 } }
	func engine(_ engine: TransportEngine, didBecomeTracksReady ready: Bool) {}
	func engine(_ engine: TransportEngine, didChangePictureInPicture isActive: Bool) {}
	func engine(_ engine: TransportEngine, didFailWithError message: String) {}
	func engine(_ engine: TransportEngine, didDetectHDRMode mode: HDRMode, fps: Double) {}
	func engineDidReachEnd(_ engine: TransportEngine) {}
}

/// A clock that moves only when told to, running what fell due in order, what that schedules included.
final class PlaybackClock {
	private struct Task {
		let id: Int
		let at: Double
		let run: () -> Void
	}

	private var now = 0.0
	private var lastId = 0
	private var tasks: [Task] = []

	lazy var deliver: FakeRemoteEngine.Delivery = { [unowned self] delay, run in
		self.lastId += 1
		let id = self.lastId
		self.tasks.append(Task(id: id, at: self.now + delay, run: run))
		return { [unowned self] in self.tasks.removeAll { $0.id == id } }
	}

	func advance(_ ms: Double) {
		let target = now + ms
		while let next = tasks.filter({ $0.at <= target }).min(by: { $0.at < $1.at || ($0.at == $1.at && $0.id < $1.id) }) {
			tasks.removeAll { $0.id == next.id }
			now = next.at
			next.run()
		}
		now = target
	}
}

let server = ReceiverServer(
	serverAddress: "https://jellyfin.example.test", accessToken: "tok-123", userId: "user-1", receiverName: "Living Room TV"
)
let capped = ReceiverServer(
	serverAddress: "https://jellyfin.example.test", accessToken: "tok-123", userId: "user-1", receiverName: "Living Room TV",
	maxBitrate: 8_000_000
)
let episodes = ReceiverPlayRequest(items: [ReceiverItem(id: "ep-1"), ReceiverItem(id: "ep-2")])

func describe(_ result: CastLoadResult) -> String {
	switch result {
	case .settled(let outcome): return outcome.wireName
	case .notSent(let error): return "notSent \(error)"
	}
}

/// A JS record as text, its keys sorted, to compare two of them.
func js(_ record: [String: Any]) -> String {
	record.keys.sorted().map { "\($0)=\(record[$0] ?? "nil")" }.joined(separator: " ")
}

/// One case's world: the holder, the engines its factory made and what it published.
final class Bench {
	let clock = PlaybackClock()
	var made: [RecordingRemoteEngine] = []
	var servers: [ReceiverServer] = []
	var published: [RemotePlaybackSnapshot] = []
	let screen = ScreenDelegate()
	lazy var playback: RemotePlayback = {
		let playback = RemotePlayback { [unowned self] server in
			self.servers.append(server)
			let engine = RecordingRemoteEngine(
				FakeRemoteEngine(
					deliver: self.clock.deliver,
					items: [FakeRemoteItem(id: "a", durationSec: 60), FakeRemoteItem(id: "b", durationSec: 60)]
				)
			)
			self.made.append(engine)
			return engine
		}
		_ = playback.addListener { [unowned self] in self.published.append($0) }
		return playback
	}()

	@discardableResult
	func connected() -> RemoteEngine? {
		playback.setServer(server)
		playback.targetChanged(connected: true, suspended: false)
		clock.advance(PlayerConstants.fakeRemoteLoadMs)
		return playback.engine
	}
}

@main
enum RemotePlaybackTests {
	static var failures: [String] = []
	static var cases = 0

	static func check(_ name: String, _ ok: Bool) {
		cases += 1
		if !ok { failures.append(name) }
	}

	static func main() {
		do {
			let bench = Bench()
			bench.playback.setServer(server)
			let none = bench.playback.engine == nil
			bench.playback.targetChanged(connected: true, suspended: false)
			check(
				"anEngineIsBornWithTheSessionAndTheServer",
				none && bench.made.count == 1 && bench.playback.engine === bench.made.first
					&& bench.servers.map(\.userId) == ["user-1"] && bench.made[0].calls == ["start"]
					&& bench.playback.snapshot.connected
			)
		}

		do {
			let bench = Bench()
			bench.playback.targetChanged(connected: true, suspended: false)
			check(
				"noServerMeansNoEngine",
				bench.playback.engine == nil && bench.made.isEmpty && !bench.playback.snapshot.connected
					&& bench.playback.snapshot.phase == .none
			)
		}

		do {
			let bench = Bench()
			bench.connected()
			bench.playback.targetChanged(connected: false, suspended: false)
			check(
				"theEngineDiesWithTheSession",
				bench.playback.engine == nil && bench.made[0].calls == ["start", "shutdown"]
					&& !bench.playback.snapshot.connected && bench.playback.snapshot.phase == .none
					&& bench.published.last?.connected == false
			)
		}

		do {
			let bench = Bench()
			let engine = bench.connected()
			bench.playback.targetChanged(connected: true, suspended: true)
			let suspended = bench.playback.engine === engine && bench.playback.snapshot.connected
				&& bench.playback.snapshot.reconnecting && bench.published.last?.reconnecting == true
			bench.playback.targetChanged(connected: true, suspended: false)
			check(
				"aSuspensionKeepsTheEngine",
				suspended && bench.playback.engine === engine && !bench.playback.snapshot.reconnecting
					&& bench.made.count == 1 && bench.made[0].calls == ["start"]
			)
		}

		do {
			let bench = Bench()
			let engine = bench.connected()
			let lent = bench.playback.attachScreen(bench.screen) === engine
			bench.playback.detachScreen(bench.screen)
			let heard = bench.screen.positions.count
			bench.clock.advance(5_000)
			check(
				"closingTheScreenSendsNothingAndKeepsTheEngine",
				lent && bench.playback.engine === engine && bench.made[0].sent.isEmpty && bench.made[0].calls == ["start"]
					&& bench.screen.positions.count == heard
			)
		}

		do {
			let bench = Bench()
			bench.connected()
			bench.clock.advance(3_000)
			_ = bench.playback.attachScreen(bench.screen)
			let caughtUp = bench.screen.loadings == [false] && bench.screen.pauses == [false]
				&& bench.screen.positions == [3] && bench.screen.readyToSeek == 1
			bench.clock.advance(1_000)
			check("anAttachedScreenIsBroughtUpToDateAtOnce", caughtUp && bench.screen.positions.last == 4)
		}

		// How the TV plays what it holds goes to JS with the rest: the technical info panel reads it.
		do {
			let bench = Bench()
			bench.connected()
			let before = bench.published.last?.playMethod == nil
			bench.made.last?.inner.simulatePlayMethod("Transcode")
			let state = bench.published.last
			check(
				"theSnapshotPublishesHowTheTvPlays",
				before && state?.playMethod == "Transcode"
					&& state?.toDictionary()["playMethod"] as? String == "Transcode"
			)
		}

		// Media another sender loaded: the snapshot says so, with what its Cast metadata names (PR 6).
		do {
			let bench = Bench()
			bench.connected()
			let before = bench.published.last?.foreign == false
			bench.made.last?.inner.simulateForeignMedia(title: "Big Buck Bunny", imageUrl: "https://other.example.test/bbb.jpg")
			let state = bench.published.last
			let map = state?.toDictionary()
			check(
				"theSnapshotNamesForeignMediaWithItsTitleAndImage",
				before && state?.foreign == true && state?.itemId == nil && state?.title == "Big Buck Bunny"
					&& state?.imageUrl == "https://other.example.test/bbb.jpg" && map?["foreign"] as? Bool == true
					&& map?["title"] as? String == "Big Buck Bunny"
					&& map?["imageUrl"] as? String == "https://other.example.test/bbb.jpg"
			)
		}

		do {
			let bench = Bench()
			let engine = bench.connected()
			let first = bench.published.last
			let playing = first?.phase == .playing && first?.itemId == "a" && first?.queueItemIds == ["a", "b"]
				&& first?.playingIndex == 0
			bench.clock.advance(2_000)
			engine?.pause()
			let last = bench.published.last
			check(
				"theSnapshotFollowsTheEngineState",
				playing && last?.phase == .paused && last?.positionSec == 2 && last?.durationSec == 60 && last?.connected == true
			)
		}

		do {
			let bench = Bench()
			bench.connected()
			let count = bench.published.count
			bench.clock.advance(5_000)
			check(
				"aPositionTickPublishesNoSnapshot", bench.published.count == count && bench.playback.snapshot.positionSec == 5
			)
		}

		do {
			let bench = Bench()
			bench.connected()
			_ = bench.playback.attachScreen(bench.screen)
			bench.playback.setServer(nil)
			check(
				"aSignOutDropsTheEngineWithoutStoppingTheTv",
				bench.playback.engine == nil && bench.made[0].calls == ["start", "shutdown"]
					&& !bench.playback.snapshot.connected && bench.published.last?.connected == false
			)
		}

		do {
			let target = RemoteTarget(kind: RemoteTarget.kindCast, id: "tv", name: "TV", volume: true)
			func of(_ phase: TargetPhase, reconnecting: Bool) -> (Bool, Bool) {
				RemotePlayback.session(of: RemoteTargetSnapshot(phase: phase, target: target, reconnecting: reconnecting, error: nil))
			}
			check(
				"theHubStateTellsWhetherASessionHolds",
				of(.connected, reconnecting: false) == (true, false) && of(.connecting, reconnecting: true) == (true, true)
					&& of(.connecting, reconnecting: false) == (false, false) && of(.ending, reconnecting: false) == (false, false)
					&& RemotePlayback.session(of: .none) == (false, false)
			)
		}

		// A tier 1 build's fake receivers have no TV behind them: the fake engine plays for them.
		do {
			let bench = Bench()
			let fake = RecordingRemoteEngine(FakeRemoteEngine(deliver: bench.clock.deliver))
			let real = RecordingRemoteEngine(FakeRemoteEngine(deliver: bench.clock.deliver))
			check(
				"theFakeReceiversPlayOnTheFakeEngine",
				RemotePlayback.factory(fake: true, real: { _ in real }, fakeEngine: { fake })(server) === fake
					&& RemotePlayback.factory(fake: false, real: { _ in real }, fakeEngine: { fake })(server) === real
			)
		}

		// JS loads through the holder, on the engine of the session: the answer is the engine's.
		do {
			let bench = Bench()
			let engine = bench.connected()
			var results: [String] = []
			bench.playback.load(server: capped, request: episodes) { results.append(describe($0)) }
			let loading = bench.published.last?.phase == .loading
			bench.clock.advance(PlayerConstants.fakeRemoteLoadMs)
			check(
				"aLoadGoesThroughTheEngineAndAnswersItsOutcome",
				loading && results == ["loaded"] && bench.playback.engine === engine && bench.made[0].servers == [capped]
					&& bench.published.last?.itemId == "ep-1" && bench.published.last?.queueItemIds == ["ep-1", "ep-2"]
			)
		}

		do {
			let bench = Bench()
			bench.playback.setServer(server)
			var results: [String] = []
			bench.playback.load(server: capped, request: episodes) { results.append(describe($0)) }
			check(
				"aLoadWithNoEngineIsNotSent", results == ["notSent \(RemotePlayback.noEngineError)"] && bench.made.isEmpty
			)
		}

		// Two presses on Play that cross: the first is replaced without a word, the TV plays the second.
		do {
			let bench = Bench()
			bench.connected()
			var first: [String] = []
			var second: [String] = []
			bench.playback.load(server: capped, request: episodes) { first.append(describe($0)) }
			bench.playback.load(server: capped, request: ReceiverPlayRequest(items: [ReceiverItem(id: "film-1")])) {
				second.append(describe($0))
			}
			bench.clock.advance(PlayerConstants.fakeRemoteLoadMs)
			check(
				"aSecondLoadSupersedesTheFirst",
				first == ["superseded"] && second == ["loaded"] && bench.published.last?.itemId == "film-1"
			)
		}

		// Another server while the engine lives (an address switched on another network, the TV renamed): the open
		// screen keeps the engine, which carries the new envelope from its next command, and nothing reaches the TV.
		do {
			let bench = Bench()
			let engine = bench.connected()
			_ = bench.playback.attachScreen(bench.screen)
			var renamed = server
			renamed.receiverName = "Den TV"
			bench.playback.setServer(renamed)
			check(
				"anotherServerGoesToTheEngineItHas",
				bench.playback.engine === engine && bench.made.count == 1 && bench.made[0].calls == ["start", "useServer"]
					&& bench.made[0].servers == [renamed] && bench.playback.snapshot.connected
			)
		}

		do {
			let bench = Bench()
			bench.connected()
			bench.playback.reload(server: capped)
			let reloaded = bench.made[0].calls == ["start", "reload"] && bench.made[0].servers == [capped]
			// Without an engine, nothing to reload and nothing made.
			bench.playback.setServer(nil)
			bench.playback.reload(server: capped)
			check("aReloadGoesToTheEngineUnderTheServerGiven", reloaded && bench.made.count == 1)
		}

		do {
			let bench = Bench()
			bench.connected()
			bench.playback.reload(server: capped)
			bench.playback.reload(server: capped, subtitleStreamIndex: 9)
			check("aReloadCarriesTheSubtitleItWasGiven", bench.made[0].reloadSubtitles == [nil, 9])
		}

		// The remote player's menus choose by Jellyfin index; -1 turns the subtitles off.
		do {
			let bench = Bench()
			bench.connected()
			bench.playback.setAudioTrack(2)
			bench.playback.setSubtitleTrack(5)
			bench.playback.setSubtitleTrack(-1)
			check(
				"aTrackChoiceGoesToTheEngine",
				bench.made[0].calls == ["start", "setAudioTrack 2", "setSubtitleTrack 5", "disableSubtitles"]
			)
		}

		do {
			let bench = Bench()
			bench.playback.setAudioTrack(2)
			check("aTrackChoiceWithoutAnEngineSendsNothing", bench.made.isEmpty)
		}

		// What JS reads of a load: the outcome under the names of RemoteLoadResult, the failure's code, the text of a
		// load that never left.
		do {
			let result = RemotePlayback.resultForJs
			check(
				"aLoadResultReachesJsByItsOutcomeName",
				js(result(.settled(.loaded))) == "outcome=loaded" && js(result(.settled(.superseded))) == "outcome=superseded"
					&& js(result(.settled(.timedOut))) == "outcome=timedOut"
					&& js(result(.settled(.failed(.playbackInfoFailed, .unparsed("x")))))
						== "error=playback_info_failed outcome=failed"
					&& js(result(.notSent("receiver busy"))) == "error=receiver busy outcome=notSent"
			)
		}

		if failures.isEmpty {
			print("PASS: remote playback holder (\(cases) cases)")
		} else {
			failures.forEach { print("FAIL: " + $0) }
			exit(1)
		}
	}
}
