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

	// The large image on the left, the titles, the bar and the transport on the right (Gauvain, 19/11).
	static func couchedPutsTheMenusInTheTopBarAndTheRestBesideTheArtwork() {
		let a = RemoteArrangement.of(.landscape)
		let name = "couchedPutsTheMenusInTheTopBarAndTheRestBesideTheArtwork"
		check(a.topBar == [.header, .bottomRow], "\(name): top bar")
		check(a.beside == .artwork, "\(name): artwork")
		check(a.column == [.titles, .bar, .transport], "\(name): column")
		check(a.bottom.isEmpty, "\(name): bottom")
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
	// together at the bottom (as Spotify's player does); wide it splits around the middle, so the transport sits
	// level with the artwork.
	static func uprightLeavesTheFreeHeightAroundTheArtwork() {
		let a = RemoteArrangement.of(.portrait)
		check(
			a.spaces == [a.column.firstIndex(of: .artwork)!, a.column.firstIndex(of: .titles)!],
			"uprightLeavesTheFreeHeightAroundTheArtwork: \(a.spaces)"
		)
	}

	// As tall as the image: the titles level with its top, the transport with its bottom, the bar between.
	static func couchedSharesTheFreeHeightAroundTheBar() {
		let a = RemoteArrangement.of(.landscape)
		check(
			a.spaces == [a.column.firstIndex(of: .bar)!, a.column.firstIndex(of: .transport)!],
			"couchedSharesTheFreeHeightAroundTheBar: \(a.spaces)"
		)
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

	// The remote "more" menu holds what the remote capabilities leave of the local one: quality and chapters. An item
	// with neither opened an empty menu, so the button is not drawn.
	static func theMoreButtonShowsOnlyWithChaptersOrQualities() {
		check(!RemoteMore.shows(chapters: 0, qualities: 0), "theMoreButtonShowsOnlyWithChaptersOrQualities: neither")
		check(RemoteMore.shows(chapters: 3, qualities: 0), "theMoreButtonShowsOnlyWithChaptersOrQualities: chapters")
		check(RemoteMore.shows(chapters: 0, qualities: 2), "theMoreButtonShowsOnlyWithChaptersOrQualities: qualities")
	}

	static func main() {
		uprightStacksTheSixSlotsTopToBottom()
		couchedPutsTheMenusInTheTopBarAndTheRestBesideTheArtwork()
		wideKeepsTheUprightColumnBesideTheArtwork()
		everyLayoutPlacesEachSlotOnce()
		uprightLeavesTheFreeHeightAroundTheArtwork()
		couchedSharesTheFreeHeightAroundTheBar()
		wideCentersTheMiddleBetweenTheHeaderAndTheBottomRow()
		theTransportKeepsTheChromeSizes()
		theTransportGapNarrowsOnlyUpright()
		subtitlesLightUpOnlyForARealTrack()
		theMoreButtonShowsOnlyWithChaptersOrQualities()
		print("PASS: remote arrangement (\(cases) cases)")
	}
}
