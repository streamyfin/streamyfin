import CoreGraphics

/// Height of the strip at the top and at the bottom of the gesture surface
/// where a drag is left to the system. Notification Centre and Control Centre
/// are pulled in from the top edge, the home indicator (Control Centre on a
/// home button iPhone) from the bottom, and iOS delivers the start of those
/// swipes to the app before it takes the touch over: pulling the shade down
/// used to turn the volume or the brightness down on the way.
///
/// One minimum touch target: a finger coming in over the bezel lands well
/// inside it, and it covers the home indicator inset the bottom guard used
/// before.
let surfaceDragEdgeInset: CGFloat = 44

/// Whether a drag that began at `startY` on a gesture surface `surfaceHeight`
/// tall began in one of the edge strips. Such a drag does nothing until the
/// finger lifts, whichever way it moves: the home indicator is swiped
/// sideways too.
func surfaceDragStartsAtScreenEdge(startY: CGFloat, surfaceHeight: CGFloat) -> Bool {
	startY < surfaceDragEdgeInset || startY >= surfaceHeight - surfaceDragEdgeInset
}
