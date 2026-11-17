import Foundation

// Where each layout puts the six slots of the remote screen (design §3.1, §3.2), and the transport's sizes.
// Same cases as Android's RemoteArrangementTest.
@main
enum RemoteArrangementTests {
	static var cases = 0

	static func check(_ ok: Bool, _ what: String) {
		cases += 1
		precondition(ok, what)
	}

	static func uprightStacksTheSixSlotsTopToBottom() {
		let a = RemoteArrangement.of(.portrait)
		check(a.column == [.header, .artwork, .titles, .bar, .transport, .bottomRow], "uprightStacksTheSixSlotsTopToBottom: column")
		check(a.topBar.isEmpty && a.beside == nil && a.bottom.isEmpty, "uprightStacksTheSixSlotsTopToBottom: nothing else")
	}

	static func couchedPutsTheTitlesAndMenusInTheTopBar() {
		let a = RemoteArrangement.of(.landscape)
		check(a.topBar == [.header, .titles, .bottomRow], "couchedPutsTheTitlesAndMenusInTheTopBar: top bar")
		check(a.beside == .artwork, "couchedPutsTheTitlesAndMenusInTheTopBar: artwork")
		check(a.column == [.transport], "couchedPutsTheTitlesAndMenusInTheTopBar: column")
		check(a.bottom == [.bar], "couchedPutsTheTitlesAndMenusInTheTopBar: bottom")
	}

	static func wideKeepsTheUprightColumnBesideTheArtwork() {
		let a = RemoteArrangement.of(.wide)
		check(a.beside == .artwork, "wideKeepsTheUprightColumnBesideTheArtwork: artwork")
		check(a.column == RemoteArrangement.of(.portrait).column.filter { $0 != .artwork }, "wideKeepsTheUprightColumnBesideTheArtwork: column")
		check(a.topBar.isEmpty && a.bottom.isEmpty, "wideKeepsTheUprightColumnBesideTheArtwork: nothing else")
	}

	static func everyLayoutPlacesEachSlotOnce() {
		for layout in [RemoteLayout.portrait, .landscape, .wide] {
			let a = RemoteArrangement.of(layout)
			let placed = a.topBar + (a.beside.map { [$0] } ?? []) + a.column + a.bottom
			check(placed.map(\.rawValue).sorted() == RemoteSlot.allCases.map(\.rawValue).sorted(), "everyLayoutPlacesEachSlotOnce: \(layout)")
		}
	}

	// The column's free height, when the screen is taller than its slots: upright it splits above and below the
	// artwork, which floats in the middle of its zone while the titles, the bar, the transport and the TV's row stay
	// together at the bottom (as Spotify's player does); couched and wide it splits around the middle, so the
	// transport sits level with the artwork.
	static func uprightLeavesTheFreeHeightAroundTheArtwork() {
		let a = RemoteArrangement.of(.portrait)
		check(
			a.spaces == [a.column.firstIndex(of: .artwork)!, a.column.firstIndex(of: .titles)!],
			"uprightLeavesTheFreeHeightAroundTheArtwork: \(a.spaces)"
		)
	}

	static func couchedCentersTheTransportBesideTheArtwork() {
		let a = RemoteArrangement.of(.landscape)
		check(a.spaces == [0, a.column.count], "couchedCentersTheTransportBesideTheArtwork")
	}

	static func wideCentersTheMiddleBetweenTheHeaderAndTheBottomRow() {
		let a = RemoteArrangement.of(.wide)
		check(
			a.spaces == [a.column.firstIndex(of: .titles)!, a.column.firstIndex(of: .bottomRow)!],
			"wideCentersTheMiddleBetweenTheHeaderAndTheBottomRow"
		)
	}

	static func theTransportKeepsTheChromeSizes() {
		for layout in [RemoteLayout.portrait, .landscape, .wide] {
			let t = RemoteTransport.of(layout)
			check([t.side, t.seek, t.play] == [44, 52, 68], "theTransportKeepsTheChromeSizes: \(layout)")
		}
	}

	static func theTransportGapNarrowsOnlyUpright() {
		check(RemoteTransport.of(.portrait).gap == 20, "theTransportGapNarrowsOnlyUpright: portrait")
		check(RemoteTransport.of(.landscape).gap == 28, "theTransportGapNarrowsOnlyUpright: landscape")
		check(RemoteTransport.of(.wide).gap == 28, "theTransportGapNarrowsOnlyUpright: wide")
	}

	static func subtitlesLightUpOnlyForARealTrack() {
		check(RemoteActive.subtitlesOn(selectedIndex: 3), "subtitlesLightUpOnlyForARealTrack: 3")
		check(RemoteActive.subtitlesOn(selectedIndex: 0), "subtitlesLightUpOnlyForARealTrack: 0")
		check(!RemoteActive.subtitlesOn(selectedIndex: -1), "subtitlesLightUpOnlyForARealTrack: off")
		check(!RemoteActive.subtitlesOn(selectedIndex: nil), "subtitlesLightUpOnlyForARealTrack: none chosen")
	}

	static func main() {
		uprightStacksTheSixSlotsTopToBottom()
		couchedPutsTheTitlesAndMenusInTheTopBar()
		wideKeepsTheUprightColumnBesideTheArtwork()
		everyLayoutPlacesEachSlotOnce()
		uprightLeavesTheFreeHeightAroundTheArtwork()
		couchedCentersTheTransportBesideTheArtwork()
		wideCentersTheMiddleBetweenTheHeaderAndTheBottomRow()
		theTransportKeepsTheChromeSizes()
		theTransportGapNarrowsOnlyUpright()
		subtitlesLightUpOnlyForARealTrack()
		print("PASS: remote arrangement (\(cases) cases)")
	}
}
