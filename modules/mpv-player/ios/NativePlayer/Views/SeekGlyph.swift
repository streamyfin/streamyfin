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

	/// The digits' font size as a share of the glyph size, measured against
	/// Apple's numbered glyphs (gobackward.30 and goforward.30): at 0.45 the
	/// drawn digits came out 12 % shorter than Apple's.
	private static let digitScale: CGFloat = 0.51

	/// How far the digits sit below the circle's centre, as a share of the
	/// glyph size, so they share Apple's top and baseline. The tvOS row draws
	/// the glyph at 22 pt, where the iOS share left them against the arrowhead.
	#if os(tvOS)
	private static let digitDrop: CGFloat = 0.12
	#else
	private static let digitDrop: CGFloat = 0.057
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
						Text("\(count)")
							.font(.system(size: size * Self.digitScale, weight: weight).monospacedDigit())
							.minimumScaleFactor(0.5)
							.lineLimit(1)
							.frame(width: size * 0.66)
							.offset(y: size * Self.digitDrop)
							.accessibilityHidden(true)
					}
				}
				// VoiceOver read only the drawn digits ("20"). It now reads the
				// arrow's own label, as for Apple's numbered glyphs, then the count.
				.accessibilityValue(seekCount(seconds).map(String.init) ?? "")
		}
	}
}
#endif
