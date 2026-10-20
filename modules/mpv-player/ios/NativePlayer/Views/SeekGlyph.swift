#if os(iOS) || os(tvOS)
import SwiftUI

/// A skip glyph that always shows its number. SF Symbols only has numbered
/// arrows for some intervals (see numberedSeekSymbol), so a skip of 20 or 120
/// seconds drew a bare arrow. Those now get the plain arrow with the number
/// drawn in it, sized and placed to match Apple's numbered glyphs. Shared by
/// the iOS center controls, the double-tap seek pill and the tvOS controls.
struct SeekGlyph: View {
	/// "gobackward" or "goforward".
	let prefix: String
	let seconds: Double
	let size: CGFloat
	var weight: Font.Weight = .semibold

	/// How far the digits sit below the circle's centre, as a share of the
	/// glyph size. The tvOS row draws the glyph at 22 pt, where the iOS share
	/// left the digits against the arrowhead, 2 px above Apple's.
	#if os(tvOS)
	private static let digitDrop: CGFloat = 0.12
	#else
	private static let digitDrop: CGFloat = 0.035
	#endif

	var body: some View {
		if let symbol = numberedSeekSymbol(prefix: prefix, seconds: seconds) {
			Image(systemName: symbol)
				.font(.system(size: size, weight: weight))
		} else {
			Image(systemName: prefix)
				.font(.system(size: size, weight: weight))
				.overlay {
					if let count = seekCount(seconds) {
						// Matched by eye against gobackward.15 and .30: the digits'
						// height, weight and the slight drop below the circle's centre.
						Text("\(count)")
							.font(.system(size: size * 0.45, weight: weight).monospacedDigit())
							.minimumScaleFactor(0.5)
							.lineLimit(1)
							.frame(width: size * 0.66)
							.offset(y: size * Self.digitDrop)
					}
				}
		}
	}
}
#endif
