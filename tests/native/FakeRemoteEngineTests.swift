import Foundation

// The fake stands in for a TV in the chrome's tests and the debug probe: a list of items on a clock that
// moves one second per progress step, with the Cast engine's transport and queue faces and no screen.

/// A clock that moves only when told to, running what was due when it moved.
final class StepClock {
	private struct Task {
		let id: Int
		let at: Double
		let run: () -> Void
	}

	private var now = 0.0
	private var lastId = 0
	private var tasks: [Task] = []
	var pending: Int { tasks.count }

	lazy var deliver: FakeRemoteEngine.Delivery = { [unowned self] delay, run in
		self.lastId += 1
		let id = self.lastId
		self.tasks.append(Task(id: id, at: self.now + delay, run: run))
		return { [unowned self] in self.tasks.removeAll { $0.id == id } }
	}

	func advance(_ ms: Double) {
		now += ms
		let due = tasks.filter { $0.at <= now }
		tasks.removeAll { $0.at <= now }
		due.forEach { $0.run() }
	}
}

final class RecordingDelegate: PlayerEngineDelegate {
	var positions: [Double] = []
	var pauses: [Bool] = []
	var loadings: [Bool] = []
	var readyToSeek = 0
	var ended = 0

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
	func engineDidReachEnd(_ engine: TransportEngine) { ended += 1 }
}

@main
enum FakeRemoteEngineTests {
	static var cases = 0
	static let step = CastEngineConstants.progressIntervalMs

	struct Bench {
		let clock = StepClock()
		let delegate = RecordingDelegate()
		let engine: FakeRemoteEngine

		init() {
			engine = FakeRemoteEngine(
				deliver: clock.deliver,
				items: [FakeRemoteItem(id: "a", durationSec: 3), FakeRemoteItem(id: "b", durationSec: 2)]
			)
			engine.delegate = delegate
		}

		func tick(_ steps: Int = 1) { for _ in 0..<steps { clock.advance(step) } }

		func started() {
			try? engine.start()
			clock.advance(PlayerConstants.fakeRemoteLoadMs)
		}
	}

	static func check(_ ok: Bool, _ what: String) {
		cases += 1
		precondition(ok, what)
	}

	static func theFakeLoadsThenPlaysAndReportsItsPosition() {
		let bench = Bench()
		try? bench.engine.start()
		check(bench.delegate.readyToSeek == 0, "theFakeLoadsThenPlaysAndReportsItsPosition: ready before the load")
		bench.clock.advance(PlayerConstants.fakeRemoteLoadMs)
		check(
			bench.delegate.loadings.last == false && bench.delegate.readyToSeek == 1
				&& bench.delegate.pauses == [false] && bench.engine.currentItemId == "a",
			"theFakeLoadsThenPlaysAndReportsItsPosition: loaded and playing"
		)
		bench.tick(2)
		check(
			bench.engine.getCurrentPosition() == 2 && bench.engine.getDuration() == 3
				&& bench.delegate.positions.last == 2,
			"theFakeLoadsThenPlaysAndReportsItsPosition: \(bench.delegate.positions)"
		)
	}

	static func aPauseStopsTheClock() {
		let bench = Bench()
		bench.started()
		bench.tick()
		bench.engine.pause()
		bench.tick(5)
		check(
			bench.engine.getCurrentPosition() == 1 && bench.engine.isPaused() && bench.delegate.pauses == [false, true],
			"aPauseStopsTheClock: \(bench.engine.getCurrentPosition())"
		)
		bench.engine.play()
		bench.tick()
		check(bench.engine.getCurrentPosition() == 2, "aPauseStopsTheClock: the clock goes on after play")
	}

	static func aSeekMovesThePositionAndAnswersItsRequest() {
		let bench = Bench()
		bench.started()
		bench.engine.seekTo(position: 2.5, exact: false)
		// iOS answers a seek with a progress report at its target.
		check(
			bench.engine.getCurrentPosition() == 2.5 && bench.delegate.positions.last == 2.5,
			"aSeekMovesThePositionAndAnswersItsRequest: \(bench.delegate.positions)"
		)
		bench.engine.seekBy(offset: -1)
		check(bench.engine.getCurrentPosition() == 1.5, "aSeekMovesThePositionAndAnswersItsRequest: seek by")
	}

	static func theItemAfterTheLastEndsPlayback() {
		let bench = Bench()
		bench.started()
		bench.tick(3)
		check(
			bench.engine.currentItemId == "b" && bench.engine.getCurrentPosition() == 0
				&& bench.engine.getDuration() == 2 && bench.delegate.ended == 0,
			"theItemAfterTheLastEndsPlayback: on to the second item"
		)
		bench.tick(2)
		check(
			bench.delegate.ended == 1 && bench.clock.pending == 0,
			"theItemAfterTheLastEndsPlayback: \(bench.delegate.ended) ends, \(bench.clock.pending) pending"
		)
	}

	static func skippingMovesToTheNextItem() {
		let bench = Bench()
		bench.started()
		bench.tick()
		bench.engine.skipToNext()
		check(
			bench.engine.currentItemId == "b" && bench.engine.getCurrentPosition() == 0,
			"skippingMovesToTheNextItem: next"
		)
		bench.engine.skipToPrevious()
		check(bench.engine.currentItemId == "a", "skippingMovesToTheNextItem: previous")
	}

	static func theFakeCannotChangeSpeed() {
		let bench = Bench()
		check(!bench.engine.canChangeSpeed && bench.engine.targetVolume == 0.5, "theFakeCannotChangeSpeed")
	}

	static func stoppingSendsNothingMore() {
		let bench = Bench()
		bench.started()
		let heard = bench.delegate.positions.count
		bench.engine.shutdown()
		bench.tick(10)
		bench.engine.play()
		check(
			bench.delegate.positions.count == heard && bench.delegate.pauses == [false] && bench.clock.pending == 0,
			"stoppingSendsNothingMore"
		)
	}

	// The phase and the scenes the remote screen is tried on.

	static func countStateChanges(_ engine: FakeRemoteEngine) -> () -> Int {
		var changes = 0
		engine.onStateChanged = { changes += 1 }
		return { changes }
	}

	static func theFakePhaseFollowsItsList() {
		let bench = Bench()
		var ok = bench.engine.phase == .none
		try? bench.engine.start()
		ok = ok && bench.engine.phase == .loading
		bench.clock.advance(PlayerConstants.fakeRemoteLoadMs)
		ok = ok && bench.engine.phase == .playing && bench.engine.queueItemIds == ["a", "b"] && bench.engine.playingIndex == 0
		bench.engine.pause()
		ok = ok && bench.engine.phase == .paused
		bench.engine.play()
		bench.tick(3)
		ok = ok && bench.engine.playingIndex == 1
		bench.tick(2)
		check(ok && bench.engine.phase == .ended, "theFakePhaseFollowsItsList")
	}

	static func theFakeTellsItsStateButNotItsTicks() {
		let bench = Bench()
		bench.started()
		let changes = countStateChanges(bench.engine)
		bench.tick()
		var ok = changes() == 0
		bench.engine.pause()
		ok = ok && changes() == 1
		bench.engine.skipToNext()
		check(ok && changes() == 2, "theFakeTellsItsStateButNotItsTicks")
	}

	static func aSimulatedSuspensionSaysReconnectingUntilTheResume() {
		let bench = Bench()
		bench.started()
		let changes = countStateChanges(bench.engine)
		bench.engine.simulateSuspended()
		var ok = bench.engine.reconnecting && changes() == 1
		let heard = bench.delegate.positions.count
		bench.tick(2)
		ok = ok && bench.delegate.positions.count == heard
		bench.engine.simulateResumed()
		check(
			ok && !bench.engine.reconnecting && changes() == 2 && bench.delegate.positions.last == 2,
			"aSimulatedSuspensionSaysReconnectingUntilTheResume"
		)
	}

	static func aSimulatedStopIsStoppedAndPlayResumesWhereItWas() {
		let bench = Bench()
		bench.started()
		bench.tick(2)
		bench.engine.simulateStoppedFromReceiver()
		var ok = bench.engine.phase == .stopped && bench.engine.stopRequested && bench.engine.isPaused()
		bench.tick(3)
		ok = ok && bench.engine.getCurrentPosition() == 2
		bench.engine.play()
		check(
			ok && bench.engine.phase == .playing && bench.engine.getCurrentPosition() == 2,
			"aSimulatedStopIsStoppedAndPlayResumesWhereItWas"
		)
	}

	static let loadServer = ReceiverServer(serverAddress: "https://jellyfin.example.test", accessToken: "tok-123", userId: "user-1")

	static func describe(_ result: CastLoadResult) -> String {
		switch result {
		case .settled(let outcome):
			if case .failed(let error, _) = outcome { return "failed \(error.rawValue)" }
			return outcome.wireName
		case .notSent(let error):
			return "notSent \(error)"
		}
	}

	// What JS asks for is what the fake plays: loading for the fake's load time, then the items asked, each as
	// long as a default one, from the start asked.
	static func theFakeEnginePlaysWhatItIsAskedToLoad() {
		let bench = Bench()
		bench.started()
		var results: [String] = []
		let request = ReceiverPlayRequest(
			items: [ReceiverItem(id: "ep-1"), ReceiverItem(id: "ep-2")], startIndex: 1, startPositionTicks: 300_000_000
		)
		bench.engine.load(server: loadServer, request: request) { results.append(describe($0)) }
		let loading = bench.engine.phase == .loading && bench.delegate.loadings.last == true && results.isEmpty
		bench.clock.advance(PlayerConstants.fakeRemoteLoadMs)
		check(
			loading && results == ["loaded"] && bench.engine.phase == .playing && bench.engine.queueItemIds == ["ep-1", "ep-2"]
				&& bench.engine.playingIndex == 1 && bench.engine.currentItemId == "ep-2" && bench.engine.getCurrentPosition() == 30
				&& bench.engine.getDuration() == PlayerConstants.fakeRemoteItemSec && bench.delegate.loadings.last == false,
			"theFakeEnginePlaysWhatItIsAskedToLoad"
		)
	}

	static func theFakeEngineFailsOnDemand() {
		let bench = Bench()
		bench.started()
		var results: [String] = []
		bench.engine.load(server: loadServer, request: ReceiverPlayRequest(items: [ReceiverItem(id: PlayerConstants.fakeRemoteFailId)])) {
			results.append(describe($0))
		}
		bench.clock.advance(PlayerConstants.fakeRemoteLoadMs)
		check(
			results == ["failed playback_failed"] && bench.engine.phase == .none && bench.engine.currentItemId == nil
				&& bench.delegate.loadings.last == false,
			"theFakeEngineFailsOnDemand"
		)
	}

	// Two loads that cross: the first answers superseded, the TV plays the second.
	static func theFakeEngineSupersedesALoadWithTheNextOne() {
		let bench = Bench()
		bench.started()
		var first: [String] = []
		var second: [String] = []
		bench.engine.load(server: loadServer, request: ReceiverPlayRequest(items: [ReceiverItem(id: "ep-1")])) { first.append(describe($0)) }
		bench.engine.load(server: loadServer, request: ReceiverPlayRequest(items: [ReceiverItem(id: "ep-2")])) { second.append(describe($0)) }
		let superseded = first == ["superseded"]
		bench.clock.advance(PlayerConstants.fakeRemoteLoadMs)
		check(
			superseded && second == ["loaded"] && bench.engine.currentItemId == "ep-2",
			"theFakeEngineSupersedesALoadWithTheNextOne"
		)
	}

	static func main() {
		theFakePhaseFollowsItsList()
		theFakeTellsItsStateButNotItsTicks()
		aSimulatedSuspensionSaysReconnectingUntilTheResume()
		aSimulatedStopIsStoppedAndPlayResumesWhereItWas()
		theFakeLoadsThenPlaysAndReportsItsPosition()
		aPauseStopsTheClock()
		aSeekMovesThePositionAndAnswersItsRequest()
		theItemAfterTheLastEndsPlayback()
		skippingMovesToTheNextItem()
		theFakeCannotChangeSpeed()
		stoppingSendsNothingMore()
		theFakeEnginePlaysWhatItIsAskedToLoad()
		theFakeEngineFailsOnDemand()
		theFakeEngineSupersedesALoadWithTheNextOne()
		print("PASS: fake remote engine (\(cases) cases)")
	}
}
