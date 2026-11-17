import Foundation

// The receiver never goes back to the start of what it plays, and its queue is not the series: previous on a
// remote screen restarts the episode on the engine or asks JS for the one before, which the episode list names.
@main
enum RemoteNavigationTests {
	static var cases = 0

	static func check(_ ok: Bool, _ what: String) {
		cases += 1
		precondition(ok, what)
	}

	static func previousPastTheFirstSecondsRestartsTheEpisode() {
		check(previousAction(positionSec: 3.5, hasPrevious: true) == .restart, "previousPastTheFirstSecondsRestartsTheEpisode: 3.5 s")
		check(previousAction(positionSec: 1_200, hasPrevious: true) == .restart, "previousPastTheFirstSecondsRestartsTheEpisode: 20 min")
	}

	static func previousAtTheStartAsksForTheEpisodeBefore() {
		check(previousAction(positionSec: 0, hasPrevious: true) == .previousItem, "previousAtTheStartAsksForTheEpisodeBefore: 0 s")
		check(previousAction(positionSec: 3, hasPrevious: true) == .previousItem, "previousAtTheStartAsksForTheEpisodeBefore: 3 s")
	}

	static func previousOnTheFirstEpisodeRestartsIt() {
		check(previousAction(positionSec: 0, hasPrevious: false) == .restart, "previousOnTheFirstEpisodeRestartsIt")
	}

	static func theNeighboursComeFromTheEpisodeList() {
		let ids = ["e1", "e2", "e3"]
		check(EpisodeNeighbours.of(ids, currentId: "e1") == EpisodeNeighbours(hasPrevious: false, hasNext: true), "theNeighboursComeFromTheEpisodeList: first")
		check(EpisodeNeighbours.of(ids, currentId: "e2") == EpisodeNeighbours(hasPrevious: true, hasNext: true), "theNeighboursComeFromTheEpisodeList: middle")
		check(EpisodeNeighbours.of(ids, currentId: "e3") == EpisodeNeighbours(hasPrevious: true, hasNext: false), "theNeighboursComeFromTheEpisodeList: last")
		// An item the list does not hold, or no item yet, has no neighbours: nothing to move to.
		check(EpisodeNeighbours.of(ids, currentId: "film") == EpisodeNeighbours(hasPrevious: false, hasNext: false), "theNeighboursComeFromTheEpisodeList: absent")
		check(EpisodeNeighbours.of(ids, currentId: nil) == EpisodeNeighbours(hasPrevious: false, hasNext: false), "theNeighboursComeFromTheEpisodeList: no item")
		check(EpisodeNeighbours.of([], currentId: "e1") == EpisodeNeighbours(hasPrevious: false, hasNext: false), "theNeighboursComeFromTheEpisodeList: no list")
	}

	static func main() {
		previousPastTheFirstSecondsRestartsTheEpisode()
		previousAtTheStartAsksForTheEpisodeBefore()
		previousOnTheFirstEpisodeRestartsIt()
		theNeighboursComeFromTheEpisodeList()
		print("PASS: remote previous and the episode neighbours (\(cases) cases)")
	}
}
