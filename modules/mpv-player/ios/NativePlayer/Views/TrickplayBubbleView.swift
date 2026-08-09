import SwiftUI

/// Preview thumbnail bubble shown above the scrubber thumb while dragging
/// (iOS) or above the transport bar while remote-scrubbing (tvOS).
/// Loads are keyed on the bucketed tile index, so scrubbing across one tile
/// issues exactly one fetch — .task(id:) naturally debounces.
struct TrickplayBubbleView: View {
	static let height: CGFloat = 84

	let provider: TrickplayProvider
	let positionSec: Double
	/// Chapter at the scrub position (JS bubble shows it over the thumbnail).
	var chapterName: String?
	/// iOS callers use the default; the TV chrome renders the bubble larger
	/// for viewing distance.
	var bubbleHeight: CGFloat = TrickplayBubbleView.height

	@State private var image: UIImage?

	var body: some View {
		VStack(spacing: 4) {
			ZStack {
				RoundedRectangle(cornerRadius: 8)
					.fill(.black.opacity(0.8))
				if let image {
					Image(uiImage: image)
						.resizable()
						.aspectRatio(contentMode: .fill)
						.clipShape(RoundedRectangle(cornerRadius: 8))
				}
			}
			.frame(width: bubbleHeight * provider.aspectRatio, height: bubbleHeight)
			.overlay(
				RoundedRectangle(cornerRadius: 8)
					.stroke(.white.opacity(0.3), lineWidth: 1)
			)

			if let chapterName {
				Text(chapterName)
					.font(.caption2)
					.foregroundStyle(.white.opacity(0.9))
					.lineLimit(1)
					.frame(maxWidth: bubbleHeight * provider.aspectRatio)
			}

			Text(formatTime(positionSec))
				.font(.caption.monospacedDigit())
				.foregroundStyle(.white)
				.padding(.horizontal, 6)
				.padding(.vertical, 2)
				.background(.black.opacity(0.6), in: Capsule())
		}
		.task(id: provider.tileIndex(forSeconds: positionSec)) {
			image = await provider.thumbnail(forSeconds: positionSec)
		}
	}
}
