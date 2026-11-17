import Foundation

// What the remote screen shows for each state of the TV (the design's table of states). Twin:
// RemoteScreenModelTest.kt.
@main
enum RemoteScreenModelTests {
	static var cases = 0

	static func check(_ ok: Bool, _ what: String) {
		cases += 1
		precondition(ok, what)
	}

	static func tv(_ phase: RemotePhase, connected: Bool = true, reconnecting: Bool = false) -> RemotePlaybackSnapshot {
		var snapshot = RemotePlaybackSnapshot.none
		snapshot.connected = connected
		snapshot.phase = phase
		snapshot.reconnecting = reconnecting
		snapshot.itemId = "episode-1"
		return snapshot
	}

	static func model(
		_ snapshot: RemotePlaybackSnapshot, hasNext: Bool = false, reduced: Bool = false, failure: String? = nil
	) -> RemoteScreenModel {
		RemoteScreenModel.of(snapshot, targetName: "Bench TV", hasNext: hasNext, reduced: reduced, failure: failure)
	}

	static func aPlayingTvLeavesEveryControlOn() {
		let screen = model(tv(.playing))
		check(screen.targetLabel == .name("Bench TV"), "aPlayingTvLeavesEveryControlOn: label")
		check(!screen.controlsDimmed, "aPlayingTvLeavesEveryControlOn: dimmed")
		check(screen.transportEnabled, "aPlayingTvLeavesEveryControlOn: transport")
		check(screen.seekEnabled, "aPlayingTvLeavesEveryControlOn: seek")
		check(screen.trackMenusEnabled, "aPlayingTvLeavesEveryControlOn: track menus")
		check(!screen.playShowsSpinner, "aPlayingTvLeavesEveryControlOn: spinner")
		check(!screen.nextUpVisible, "aPlayingTvLeavesEveryControlOn: next up")
		check(screen.closes == nil, "aPlayingTvLeavesEveryControlOn: closes")
	}

	static func aLoadingTvSpinsInThePlayButton() {
		let screen = model(tv(.loading))
		check(screen.playShowsSpinner, "aLoadingTvSpinsInThePlayButton: spinner")
		check(screen.transportEnabled, "aLoadingTvSpinsInThePlayButton: transport")
		check(screen.seekEnabled, "aLoadingTvSpinsInThePlayButton: seek")
		check(screen.closes == nil, "aLoadingTvSpinsInThePlayButton: closes")
	}

	static func aReconnectingTvDimsTheControlsAndSaysSo() {
		let screen = model(tv(.playing, reconnecting: true))
		check(screen.targetLabel == .reconnecting, "aReconnectingTvDimsTheControlsAndSaysSo: label")
		check(screen.controlsDimmed, "aReconnectingTvDimsTheControlsAndSaysSo: dimmed")
		check(!screen.transportEnabled, "aReconnectingTvDimsTheControlsAndSaysSo: transport")
		check(!screen.seekEnabled, "aReconnectingTvDimsTheControlsAndSaysSo: seek")
		check(!screen.trackMenusEnabled, "aReconnectingTvDimsTheControlsAndSaysSo: track menus")
		check(!screen.playShowsSpinner, "aReconnectingTvDimsTheControlsAndSaysSo: spinner")
		check(screen.closes == nil, "aReconnectingTvDimsTheControlsAndSaysSo: closes")
	}

	static func betweenTwoItemsTheBarAndTrackMenusAreInactive() {
		let screen = model(tv(.between))
		check(!screen.seekEnabled, "betweenTwoItemsTheBarAndTrackMenusAreInactive: seek")
		check(!screen.trackMenusEnabled, "betweenTwoItemsTheBarAndTrackMenusAreInactive: track menus")
		check(screen.playShowsSpinner, "betweenTwoItemsTheBarAndTrackMenusAreInactive: spinner")
		check(screen.transportEnabled, "betweenTwoItemsTheBarAndTrackMenusAreInactive: transport")
		check(screen.closes == nil, "betweenTwoItemsTheBarAndTrackMenusAreInactive: closes")
	}

	static func theEndOfTheListOffersTheNextEpisode() {
		let screen = model(tv(.ended), hasNext: true)
		check(screen.nextUpVisible, "theEndOfTheListOffersTheNextEpisode: next up")
		check(screen.closes == nil, "theEndOfTheListOffersTheNextEpisode: closes")
	}

	static func aFilmThatEndsClosesThePlayer() {
		let screen = model(tv(.ended), hasNext: false)
		check(!screen.nextUpVisible, "aFilmThatEndsClosesThePlayer: next up")
		check(screen.closes == .playbackEnded, "aFilmThatEndsClosesThePlayer: closes")
	}

	static func aTvStoppedFromItsRemoteKeepsThePlayerAndOffersToResume() {
		let screen = model(tv(.stopped))
		check(screen.closes == nil, "aTvStoppedFromItsRemoteKeepsThePlayerAndOffersToResume: closes")
		check(screen.transportEnabled, "aTvStoppedFromItsRemoteKeepsThePlayerAndOffersToResume: transport")
		check(!screen.seekEnabled, "aTvStoppedFromItsRemoteKeepsThePlayerAndOffersToResume: seek")
		check(!screen.playShowsSpinner, "aTvStoppedFromItsRemoteKeepsThePlayerAndOffersToResume: spinner")
	}

	static func aFinishedConnectionClosesThePlayer() {
		// Whatever the TV last said, and with a next episode known: the connection is over.
		let screen = model(tv(.playing, connected: false), hasNext: true)
		check(screen.closes == .remoteEnded, "aFinishedConnectionClosesThePlayer: closes")
		check(!screen.nextUpVisible, "aFinishedConnectionClosesThePlayer: next up")
	}

	static func aFailureShowsItsMessage() {
		check(
			model(tv(.playing), failure: "Could not play there").failure == "Could not play there",
			"aFailureShowsItsMessage: playing"
		)
		check(
			model(tv(.stopped, reconnecting: true), failure: "Could not play there").failure == "Could not play there",
			"aFailureShowsItsMessage: whatever the rest"
		)
		check(model(tv(.playing)).failure == nil, "aFailureShowsItsMessage: none")
	}

	static func aReducedPlayerHasNoTrackMenus() {
		let screen = model(tv(.playing), reduced: true)
		check(!screen.trackMenusEnabled, "aReducedPlayerHasNoTrackMenus: track menus")
		check(screen.seekEnabled, "aReducedPlayerHasNoTrackMenus: seek")
		check(screen.transportEnabled, "aReducedPlayerHasNoTrackMenus: transport")
	}

	static func theReasonsAreTheJsOnes() {
		check(RemoteClose.playbackEnded.reason == "playbackEnded", "theReasonsAreTheJsOnes: playbackEnded")
		check(RemoteClose.remoteEnded.reason == "remoteEnded", "theReasonsAreTheJsOnes: remoteEnded")
	}

	static func main() {
		aPlayingTvLeavesEveryControlOn()
		aLoadingTvSpinsInThePlayButton()
		aReconnectingTvDimsTheControlsAndSaysSo()
		betweenTwoItemsTheBarAndTrackMenusAreInactive()
		theEndOfTheListOffersTheNextEpisode()
		aFilmThatEndsClosesThePlayer()
		aTvStoppedFromItsRemoteKeepsThePlayerAndOffersToResume()
		aFinishedConnectionClosesThePlayer()
		aFailureShowsItsMessage()
		aReducedPlayerHasNoTrackMenus()
		theReasonsAreTheJsOnes()
		print("PASS: remote screen model (\(cases) cases)")
	}
}
