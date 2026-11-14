import SwiftUI

/// The mark of a live stream, where a film has its bar and its times. Shared
/// by the phone and TV chromes, which pass their own sizes.
struct LiveBadge: View {
	let text: String
	let fontSize: CGFloat
	let horizontalPadding: CGFloat
	let verticalPadding: CGFloat

	/// The LIVE badge red, keep in sync with constants/Colors.ts `live`.
	static let color = Color(red: 239 / 255, green: 68 / 255, blue: 68 / 255)

	var body: some View {
		Text(text)
			.font(.system(size: fontSize, weight: .bold))
			.foregroundStyle(.white)
			.lineLimit(1)
			.padding(.horizontal, horizontalPadding)
			.padding(.vertical, verticalPadding)
			.background(Self.color, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
	}
}
