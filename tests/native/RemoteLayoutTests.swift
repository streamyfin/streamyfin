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
		// The same holds couched, where the bar and the top bar share the height with the artwork.
		let couched = RemoteMetrics.artworkHeight(layout: .landscape, width: 640, height: 360, fontScale: 1)
		let couchedLarge = RemoteMetrics.artworkHeight(layout: .landscape, width: 640, height: 360, fontScale: 1.5)
		check(couchedLarge < couched, "theArtworkShrinksBeforeAnythingIsCut: couched")
		check(
			couched + RemoteMetrics.chromeHeight(layout: .landscape, fontScale: 1) <= 360,
			"theArtworkShrinksBeforeAnythingIsCut: couched fits"
		)
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
		check(RemoteMetrics.artworkHeight(layout: .landscape, width: 568, height: 200, fontScale: 2) == min, "minimum: landscape")
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
		// Couched, the artwork's box wraps it; upright, nothing stands beside the column.
		check(RemoteMetrics.besideWidth(layout: .landscape, width: 844) == nil, "theWideArtworkGetsItsShareOfTheWholeWidth: couched")
		check(RemoteMetrics.besideWidth(layout: .portrait, width: 390) == nil, "theWideArtworkGetsItsShareOfTheWholeWidth: upright")
	}

	static func main() {
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
		print("PASS: remote layout (\(cases) cases)")
	}
}
