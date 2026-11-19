import Foundation

// The remote screen's two gestures (design §3.8): a drag down closes it like the chevron, a double tap on a half
// of the artwork seeks. Same cases as Android's RemoteGesturesTest.
@main
enum RemoteGesturesTests {
	static var cases = 0
	static let height = 800.0

	static func check(_ ok: Bool, _ what: String) {
		cases += 1
		precondition(ok, what)
	}

	static func aShortSlowDragStays() {
		check(!RemoteGestures.shouldDismissOnDrag(distance: 60, velocity: 300, height: height), "aShortSlowDragStays: short and slow")
		check(!RemoteGestures.shouldDismissOnDrag(distance: 199, velocity: 0, height: height), "aShortSlowDragStays: just under a quarter")
	}

	static func aQuarterScreenDragCloses() {
		check(RemoteGestures.shouldDismissOnDrag(distance: 200, velocity: 0, height: height), "aQuarterScreenDragCloses: a quarter")
		check(RemoteGestures.shouldDismissOnDrag(distance: 500, velocity: -100, height: height), "aQuarterScreenDragCloses: held back at the end")
	}

	static func aFastFlickCloses() {
		check(RemoteGestures.shouldDismissOnDrag(distance: 40, velocity: 1200, height: height), "aFastFlickCloses: fast")
		check(!RemoteGestures.shouldDismissOnDrag(distance: 40, velocity: 1199, height: height), "aFastFlickCloses: just too slow")
		// Ended above where it started: a flick back down to it is not a drag down.
		check(!RemoteGestures.shouldDismissOnDrag(distance: -40, velocity: 2000, height: height), "aFastFlickCloses: above the start")
	}

	static func aDoubleTapOnTheLeftHalfSeeksBack() {
		check(RemoteGestures.artworkTapSeek(xFraction: 0) == -1, "aDoubleTapOnTheLeftHalfSeeksBack: left edge")
		check(RemoteGestures.artworkTapSeek(xFraction: 0.49) == -1, "aDoubleTapOnTheLeftHalfSeeksBack: just left of the middle")
		check(RemoteGestures.artworkTapSeek(xFraction: 0.5) == 1, "aDoubleTapOnTheLeftHalfSeeksBack: the middle goes forward")
		check(RemoteGestures.artworkTapSeek(xFraction: 1) == 1, "aDoubleTapOnTheLeftHalfSeeksBack: right edge")
	}

	static func theHalvesDoNotMirrorInRightToLeft() {
		// The fraction runs from the physical left edge, as the screen reads the tap; time runs left to right in
		// every language, so nothing here takes a writing direction and the halves never swap.
		let sides = [0.1, 0.3, 0.7, 0.9].map { RemoteGestures.artworkTapSeek(xFraction: $0) }
		check(sides == [-1, -1, 1, 1], "theHalvesDoNotMirrorInRightToLeft")
	}

	static func main() {
		aShortSlowDragStays()
		aQuarterScreenDragCloses()
		aFastFlickCloses()
		aDoubleTapOnTheLeftHalfSeeksBack()
		theHalvesDoNotMirrorInRightToLeft()
		print("PASS: remote gestures (\(cases) cases)")
	}
}
