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

	static func main() {
		aTallNarrowScreenTakesThePortraitLayout()
		aShortScreenTakesTheLandscapeLayout()
		aWideScreenPutsTheArtworkBesideTheControls()
		aFoldedThenUnfoldedPhoneChangesLayout()
		aNarrowSplitViewOnATabletIsPortrait()
		theArtworkShrinksBeforeAnythingIsCut()
		theArtworkNeverGoesUnderItsMinimum()
		theArtworkIsNeverWiderThanItsColumn()
		print("PASS: remote layout (\(cases) cases)")
	}
}
