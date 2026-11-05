#if os(iOS)
import SwiftUI

/// The Cast glyph, which SF Symbols does not have: the Material Icons "cast" and "cast_connected" paths (Apache
/// License 2.0), in their 24 point box, scaled into the frame. Connected, the screen is filled.
struct CastGlyph: Shape {
	var connected: Bool

	func path(in rect: CGRect) -> Path {
		let side = min(rect.width, rect.height)
		let scale = side / 24
		let origin = CGPoint(x: rect.midX - side / 2, y: rect.midY - side / 2)
		func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
			CGPoint(x: origin.x + x * scale, y: origin.y + y * scale)
		}

		var path = Path()
		// The screen's frame, open at the bottom left where the waves are.
		path.move(to: p(21, 3))
		path.addLine(to: p(3, 3))
		path.addCurve(to: p(1, 5), control1: p(1.9, 3), control2: p(1, 3.9))
		path.addLine(to: p(1, 8))
		path.addLine(to: p(3, 8))
		path.addLine(to: p(3, 5))
		path.addLine(to: p(21, 5))
		path.addLine(to: p(21, 19))
		path.addLine(to: p(14, 19))
		path.addLine(to: p(14, 21))
		path.addLine(to: p(21, 21))
		path.addCurve(to: p(23, 19), control1: p(22.1, 21), control2: p(23, 20.1))
		path.addLine(to: p(23, 5))
		path.addCurve(to: p(21, 3), control1: p(23, 3.9), control2: p(22.1, 3))
		path.closeSubpath()
		// The three waves, from the corner out.
		path.move(to: p(1, 18))
		path.addLine(to: p(1, 21))
		path.addLine(to: p(4, 21))
		path.addCurve(to: p(1, 18), control1: p(4, 19.34), control2: p(2.66, 18))
		path.closeSubpath()
		path.move(to: p(1, 14))
		path.addLine(to: p(1, 16))
		path.addCurve(to: p(6, 21), control1: p(3.76, 16), control2: p(6, 18.24))
		path.addLine(to: p(8, 21))
		path.addCurve(to: p(1, 14), control1: p(8, 17.13), control2: p(4.87, 14))
		path.closeSubpath()
		path.move(to: p(1, 10))
		path.addLine(to: p(1, 12))
		path.addCurve(to: p(10, 21), control1: p(5.97, 12), control2: p(10, 16.03))
		path.addLine(to: p(12, 21))
		path.addCurve(to: p(1, 10), control1: p(12, 14.92), control2: p(7.07, 10))
		path.closeSubpath()
		if connected {
			path.move(to: p(19, 7))
			path.addLine(to: p(5, 7))
			path.addLine(to: p(5, 8.63))
			path.addCurve(to: p(13.37, 17), control1: p(8.96, 9.91), control2: p(12.09, 13.04))
			path.addLine(to: p(19, 17))
			path.closeSubpath()
		}
		return path
	}
}

/// The app's accent (#9334E9, Colors.primary): a connected receiver tints the glyph, and the output sheet draws
/// with it.
let castConnectedTint = Color(red: 147 / 255, green: 52 / 255, blue: 233 / 255)
#endif
