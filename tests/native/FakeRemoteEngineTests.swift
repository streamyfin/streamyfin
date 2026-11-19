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

	static func main() {
		theFakeLoadsThenPlaysAndReportsItsPosition()
		aPauseStopsTheClock()
		aSeekMovesThePositionAndAnswersItsRequest()
		theItemAfterTheLastEndsPlayback()
		skippingMovesToTheNextItem()
		theFakeCannotChangeSpeed()
		stoppingSendsNothingMore()
		print("PASS: fake remote engine (\(cases) cases)")
	}
}
