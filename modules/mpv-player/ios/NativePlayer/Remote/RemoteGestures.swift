import Foundation

/// The remote screen's two gestures (design §3.8), as decisions the screen asks for. Android: RemoteGestures.kt.
/// No side swipe: a stray one would change what the TV plays.
enum RemoteGestures {
	/// A drag down that ended `distance` points below where it started, at `velocity` points per second (down is
	/// positive), closes the screen once it covers a quarter of `height` or is flicked; one ending above its start
	/// never does.
	static func shouldDismissOnDrag(distance: Double, velocity: Double, height: Double) -> Bool {
		distance > 0
			&& (distance >= height * PlayerConstants.remoteDismissDragFraction
				|| velocity >= PlayerConstants.remoteDismissDragVelocity)
	}

	/// A double tap at `xFraction` of the artwork's width, from its physical left edge: −1 seeks back, +1 forward.
	/// Not mirrored in a right-to-left language, where time still runs left to right.
	static func artworkTapSeek(xFraction: Double) -> Int {
		xFraction < 0.5 ? -1 : 1
	}
}
