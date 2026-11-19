import Foundation

// The remote screen picks its layout from the window's size class, never from the device model, and the
// artwork gives up its height before any text or control is cut. Same cases as Android's RemoteLayoutTest.
@main
enum RemoteLayoutTests {
	static var cases = 0

	static func check(_ ok: Bool, _ what: String) {
		cases += 1
		precondition(ok, what)
	}

	static func aTallNarrowScreenTakesThePortraitLayout() {
		check(RemoteLayout.of(width: 390, height: 844) == .portrait, "aTallNarrowScreenTakesThePortraitLayout")
	}

	static func aShortScreenTakesTheLandscapeLayout() {
		check(RemoteLayout.of(width: 844, height: 390) == .landscape, "aShortScreenTakesTheLandscapeLayout")
		// A short window stays landscape however wide it is: a tablet's split view at the bottom.
		check(RemoteLayout.of(width: 1180, height: 400) == .landscape, "aShortScreenTakesTheLandscapeLayout: wide and short")
	}

	static func aWideScreenPutsTheArtworkBesideTheControls() {
		check(RemoteLayout.of(width: 820, height: 1180) == .wide, "aWideScreenPutsTheArtworkBesideTheControls: upright")
		check(RemoteLayout.of(width: 1180, height: 820) == .wide, "aWideScreenPutsTheArtworkBesideTheControls: couched")
	}

	static func aFoldedThenUnfoldedPhoneChangesLayout() {
		check(RemoteLayout.of(width: 360, height: 800) == .portrait, "aFoldedThenUnfoldedPhoneChangesLayout: folded")
		check(RemoteLayout.of(width: 673, height: 841) == .wide, "aFoldedThenUnfoldedPhoneChangesLayout: unfolded")
		check(RemoteLayout.of(width: 360, height: 800) == .portrait, "aFoldedThenUnfoldedPhoneChangesLayout: folded again")
	}

	static func aNarrowSplitViewOnATabletIsPortrait() {
		check(RemoteLayout.of(width: 400, height: 1024) == .portrait, "aNarrowSplitViewOnATabletIsPortrait")
	}

	static func theArtworkShrinksBeforeAnythingIsCut() {
		let normal = RemoteMetrics.artworkHeight(layout: .portrait, width: 360, height: 640, fontScale: 1)
		let large = RemoteMetrics.artworkHeight(layout: .portrait, width: 360, height: 640, fontScale: 2)
		check(large < normal, "theArtworkShrinksBeforeAnythingIsCut: \(large) at 2.0 is not under \(normal) at 1.0")
		// Above its minimum, the artwork leaves room for everything else: the column does not scroll.
		for (scale, artwork) in [(1.0, normal), (2.0, large)] {
			check(artwork > PlayerConstants.remoteArtworkMin, "theArtworkShrinksBeforeAnythingIsCut: above minimum")
			let rest = RemoteMetrics.chromeHeight(layout: .portrait, fontScale: scale)
			check(artwork + rest <= 640, "theArtworkShrinksBeforeAnythingIsCut: \(artwork) + \(rest) overflows at \(scale)")
		}
	}

	// Measured at the probe on an iPhone 17, default text size, every slot filled: header 44, five gaps of 16, titles
	// 48 (title 26, subtitle 18, 4 between), bar block 94 (chapter 14, times 15, the rest the track's touch area),
	// transport 68, bottom row 44. The four text lines (73) are the part that grows with the text size.
	static func theUprightChromeMatchesTheMeasuredScreen() {
		let one = RemoteMetrics.chromeHeight(layout: .portrait, fontScale: 1)
		let two = RemoteMetrics.chromeHeight(layout: .portrait, fontScale: 2)
		check(one == 378, "theUprightChromeMatchesTheMeasuredScreen: \(one), measured 378")
		check(two - one == 73, "theUprightChromeMatchesTheMeasuredScreen: text \(two - one), measured 73")
	}

	static func theArtworkNeverGoesUnderItsMinimum() {
		let min = PlayerConstants.remoteArtworkMin
		check(RemoteMetrics.artworkHeight(layout: .portrait, width: 320, height: 480, fontScale: 3) == min, "minimum: portrait")
		check(RemoteMetrics.artworkHeight(layout: .wide, width: 600, height: 120, fontScale: 1) == min, "minimum: wide")
		// Nor over its maximum, on the largest tablet.
		let max = PlayerConstants.remoteArtworkMax
		check(RemoteMetrics.artworkHeight(layout: .wide, width: 1366, height: 1024, fontScale: 1) == max, "maximum: wide")
		check(RemoteMetrics.artworkHeight(layout: .portrait, width: 480, height: 1600, fontScale: 1) == max, "maximum: portrait")
	}

	static func theArtworkIsNeverWiderThanItsColumn() {
		let portrait = RemoteMetrics.artworkHeight(layout: .portrait, width: 360, height: 1200, fontScale: 1)
		check(portrait == 360 - 2 * PlayerConstants.remoteHorizontalPadding, "theArtworkIsNeverWiderThanItsColumn: portrait")
		let wide = RemoteMetrics.artworkHeight(layout: .wide, width: 673, height: 841, fontScale: 1)
		check(wide <= 673 * PlayerConstants.remoteWideArtworkFraction, "theArtworkIsNeverWiderThanItsColumn: wide")
	}

	// Its box is the share of the screen's width the artwork is sized against, whatever the column beside it takes.
	static func theWideArtworkGetsItsShareOfTheWholeWidth() {
		for width in [673.0, 800, 1280] {
			let box = RemoteMetrics.besideWidth(layout: .wide, width: width)
			check(box == width * PlayerConstants.remoteWideArtworkFraction, "theWideArtworkGetsItsShareOfTheWholeWidth: \(String(describing: box)) at \(width)")
			let artwork = RemoteMetrics.artworkHeight(layout: .wide, width: width, height: 800, fontScale: 1)
			check(artwork <= (box ?? 0), "theWideArtworkGetsItsShareOfTheWholeWidth: \(artwork) does not fit at \(width)")
		}
		// Upright, nothing stands beside the column.
		check(RemoteMetrics.besideWidth(layout: .portrait, width: 390) == nil, "theWideArtworkGetsItsShareOfTheWholeWidth: upright")
	}

	// Wide, the artwork is centered in its share of the width. Sized to the whole share, it touched the titles beside it
	// on a tablet upright or an unfolded phone; it keeps the side margin on each side of its box.
	static func theWideArtworkKeepsAMarginBesideTheColumn() {
		for width in [673.0, 800, 841] {
			let box = RemoteMetrics.besideWidth(layout: .wide, width: width) ?? 0
			let artwork = RemoteMetrics.artworkHeight(layout: .wide, width: width, height: 1280, fontScale: 1)
			let margin = (box - artwork) / 2
			check(margin >= PlayerConstants.remoteHorizontalPadding, "theWideArtworkKeepsAMarginBesideTheColumn: \(margin) at \(width)")
		}
	}

	// Five buttons and their gaps (340 upright) are wider than the column of a 375pt iPhone (327) or a 360dp phone
	// (312): the gap gives way, never a button. Wide from 600, the column is 0.55w - 48, 282 there, under the 372 the
	// 28 gap asks for.
	static func theTransportGapGivesWayOnANarrowColumn() {
		let upright = RemoteTransport.of(.portrait)
		let five = 2 * upright.side + 2 * upright.seek + upright.play
		check(abs(upright.fittingGap(width: 312, buttons: five, count: 5) - 13) < 1e-9, "theTransportGapGivesWayOnANarrowColumn: 312")
		check(abs(RemoteTransport.of(.wide).fittingGap(width: 282, buttons: five, count: 5) - 5.5) < 1e-9, "theTransportGapGivesWayOnANarrowColumn: wide")
		// With room, the design's gap; never below zero; one button has no gap to fit.
		check(upright.fittingGap(width: 363, buttons: five, count: 5) == PlayerConstants.remoteTransportGapPortrait, "theTransportGapGivesWayOnANarrowColumn: room")
		check(upright.fittingGap(width: 200, buttons: five, count: 5) == 0, "theTransportGapGivesWayOnANarrowColumn: floor")
		check(upright.fittingGap(width: 10, buttons: upright.play, count: 1) == upright.gap, "theTransportGapGivesWayOnANarrowColumn: one")
	}

	static func aTintFromJsGivesTheScreenItsColors() {
		let colors = RemoteColors.of(top: "#1F3340", bottom: "#0e1a21", accent: "#C9A7FB")
		check(colors == RemoteColors(top: 0x1F3340, bottom: 0x0E1A21, accent: 0xC9A7FB), "aTintFromJsGivesTheScreenItsColors: \(colors)")
	}

	static func aMissingOrUnreadableTintFallsBackToTheNeutral() {
		let neutral = RemoteColors(
			top: PlayerConstants.remoteTintNeutralTop,
			bottom: PlayerConstants.remoteTintNeutralBottom,
			accent: PlayerConstants.remoteActiveColor
		)
		check(RemoteColors.of(top: nil, bottom: nil, accent: nil) == neutral, "aMissingOrUnreadableTintFallsBackToTheNeutral: nil")
		// Half a background is no background: both stops fall back together.
		let half = RemoteColors.of(top: "#1F3340", bottom: "teal", accent: "#112233")
		check(half == RemoteColors(top: neutral.top, bottom: neutral.bottom, accent: 0x112233), "aMissingOrUnreadableTintFallsBackToTheNeutral: half")
		check(RemoteColors.of(top: "#fff", bottom: "+12345", accent: "#C9A7FB00") == neutral, "aMissingOrUnreadableTintFallsBackToTheNeutral: unreadable")
	}

	static func theArtworkRequestCarriesTheCustomHeaders() {
		let server = ["X-Proxy-Auth": "server"]
		let own = ["X-Proxy-Auth": "own"]
		check(RemoteImageHeaders.of(own: own, server: server) == own, "theArtworkRequestCarriesTheCustomHeaders: own first")
		check(RemoteImageHeaders.of(own: nil, server: server) == server, "theArtworkRequestCarriesTheCustomHeaders: server")
		// An empty map is no headers, as on Android: the server's still apply.
		check(RemoteImageHeaders.of(own: [:], server: server) == server, "theArtworkRequestCarriesTheCustomHeaders: empty own")
		check(RemoteImageHeaders.of(own: nil, server: [:]) == nil, "theArtworkRequestCarriesTheCustomHeaders: none")
	}

	static func near(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 1e-9 }

	// Couched (validated by Gauvain on the 19/11 captures): two equal halves between the side margins and the
	// gutter, the image in its own shape, as large as its half and the band under the top bar leave it (an inset
	// above and below). Android's numbers, measured on the Medium_Phone emulator lying down, 914 x 363 within the
	// system bars.
	static func couchedTheImageTakesItsShapeInTheLeftHalf() {
		let name = "couchedTheImageTakesItsShapeInTheLeftHalf"
		check(RemoteMetrics.besideWidth(layout: .landscape, width: 914) == 421, "\(name): half")
		let cases: [(Double?, RemoteBox)] = [
			// An episode's wide image is as wide as its half.
			(16.0 / 9.0, RemoteBox(width: 421, height: 421.0 * 9 / 16)),
			// A poster is as tall as the band leaves: 363 - 44 - 2 x 16.
			(2.0 / 3.0, RemoteBox(width: 287.0 * 2 / 3, height: 287)),
			// No shape known, another server's media: the square the artwork always had.
			(nil, RemoteBox(width: 287, height: 287)),
		]
		for (ratio, expected) in cases {
			let box = RemoteMetrics.artworkBox(layout: .landscape, width: 914, height: 363, fontScale: 1, aspectRatio: ratio)
			check(near(box.width, expected.width), "\(name): width \(box.width) at \(String(describing: ratio))")
			check(near(box.height, expected.height), "\(name): height \(box.height) at \(String(describing: ratio))")
		}
		// A small phone, 640 x 360: halves of 284.
		let small = RemoteMetrics.artworkBox(layout: .landscape, width: 640, height: 360, fontScale: 1, aspectRatio: 16.0 / 9.0)
		check(near(small.width, 284), "\(name): small phone \(small.width)")
	}

	// Couched, the band is what the top bar leaves as it is measured: at an accessibility size the TV button outgrows
	// the 44 of the other buttons, and a fixed 44 pushed the image past its band (review of the 19/11). Before the
	// first measure, the 44 of its buttons. Twin: couchedTheBandIsWhatTheMeasuredTopBarLeaves in RemoteLayoutTest.kt.
	static func couchedTheBandIsWhatTheMeasuredTopBarLeaves() {
		let name = "couchedTheBandIsWhatTheMeasuredTopBarLeaves"
		let measured = RemoteMetrics.artworkBox(
			layout: .landscape, width: 914, height: 363, fontScale: 2, aspectRatio: 2.0 / 3.0, topBarHeight: 60
		)
		check(measured.height == 271, "\(name): \(measured.height), not 363 - 60 - 2 x 16")
		let unmeasured = RemoteMetrics.artworkBox(
			layout: .landscape, width: 914, height: 363, fontScale: 2, aspectRatio: 2.0 / 3.0, topBarHeight: nil
		)
		check(unmeasured.height == 287, "\(name): \(unmeasured.height) before the first measure")
	}

	// Couched, the text stands beside the image, not above or below it: a larger font leaves the image as it is (the
	// column scrolls instead). A shape that cannot be one is the square too.
	static func couchedTheImageIgnoresTheFontScaleAndAShapeThatIsNone() {
		let name = "couchedTheImageIgnoresTheFontScaleAndAShapeThatIsNone"
		let one = RemoteMetrics.artworkBox(layout: .landscape, width: 914, height: 363, fontScale: 1, aspectRatio: 2.0 / 3.0)
		let two = RemoteMetrics.artworkBox(layout: .landscape, width: 914, height: 363, fontScale: 2, aspectRatio: 2.0 / 3.0)
		check(one == two, "\(name): \(two) at 2.0 is not \(one)")
		let square = RemoteMetrics.artworkBox(layout: .landscape, width: 914, height: 363, fontScale: 1, aspectRatio: nil)
		for bad in [0.0, -1, .nan, .infinity] {
			let box = RemoteMetrics.artworkBox(layout: .landscape, width: 914, height: 363, fontScale: 1, aspectRatio: bad)
			check(box == square, "\(name): shape \(bad) gives \(box)")
		}
	}

	// Upright and wide, the artwork keeps its square, whatever the image's shape: those layouts are unchanged.
	static func uprightAndWideTheArtworkStaysASquare() {
		for (layout, w, h) in [(RemoteLayout.portrait, 390.0, 844.0), (.wide, 1180, 820)] {
			let side = RemoteMetrics.artworkHeight(layout: layout, width: w, height: h, fontScale: 1)
			let box = RemoteMetrics.artworkBox(layout: layout, width: w, height: h, fontScale: 1, aspectRatio: 16.0 / 9.0)
			check(box == RemoteBox(width: side, height: side), "uprightAndWideTheArtworkStaysASquare: \(layout) \(box)")
		}
	}

	// The top bar's ink meets the margins: the chevron's 44 box has 14 of air on its left, the dots of "more" 20 on
	// their right, a track button's 22 icon 11; the TV button's pill ends at its box.
	static func couchedTheTopBarsInkMeetsTheMargins() {
		let name = "couchedTheTopBarsInkMeetsTheMargins"
		check(RemoteMetrics.topBarInkInsets(end: .more) == (14, 20), "\(name): more")
		check(RemoteMetrics.topBarInkInsets(end: .trackButton) == (14, 11), "\(name): track button")
		check(RemoteMetrics.topBarInkInsets(end: .target) == (14, 0), "\(name): TV")
		// What ends the bar: "more" when it has a menu, else the last track button, else the TV.
		check(RemoteTopBarEnd.of(showsMore: true, trackButtons: 3) == .more, "\(name): ends on more")
		check(RemoteTopBarEnd.of(showsMore: false, trackButtons: 1) == .trackButton, "\(name): ends on a track button")
		check(RemoteTopBarEnd.of(showsMore: false, trackButtons: 0) == .target, "\(name): ends on the TV")
	}

	static func main() {
		theArtworkRequestCarriesTheCustomHeaders()
		aTallNarrowScreenTakesThePortraitLayout()
		aShortScreenTakesTheLandscapeLayout()
		aWideScreenPutsTheArtworkBesideTheControls()
		aFoldedThenUnfoldedPhoneChangesLayout()
		aNarrowSplitViewOnATabletIsPortrait()
		theArtworkShrinksBeforeAnythingIsCut()
		theUprightChromeMatchesTheMeasuredScreen()
		theArtworkNeverGoesUnderItsMinimum()
		theArtworkIsNeverWiderThanItsColumn()
		theWideArtworkGetsItsShareOfTheWholeWidth()
		theWideArtworkKeepsAMarginBesideTheColumn()
		theTransportGapGivesWayOnANarrowColumn()
		couchedTheImageTakesItsShapeInTheLeftHalf()
		couchedTheImageIgnoresTheFontScaleAndAShapeThatIsNone()
		couchedTheBandIsWhatTheMeasuredTopBarLeaves()
		uprightAndWideTheArtworkStaysASquare()
		couchedTheTopBarsInkMeetsTheMargins()
		aTintFromJsGivesTheScreenItsColors()
		aMissingOrUnreadableTintFallsBackToTheNeutral()
		print("PASS: remote layout (\(cases) cases)")
	}
}
