#if os(tvOS)
import SwiftUI

/// Scrub preview for the tvOS chrome: the episode shelf card with a trickplay
/// frame in it. Same poster geometry, same frosted band, same text inset —
/// all of it via TVPoster/TVPosterScrim rather than copied numbers, so the
/// two cannot drift apart.
///
/// The timestamp is the only text inside. The bar underneath already carries
/// the chapter at the scrub position (under the elapsed time, paired with the
/// ends-at line), so repeating it here would print the same string twice,
/// 30pt apart.
///
/// Loads are keyed on the bucketed tile index, so scrubbing across one tile
/// issues exactly one fetch — .task(id:) naturally debounces.
@available(tvOS 26.0, *)
struct TVTrickplayCard: View {
	static let width = TVPoster.width
	static let height = TVPoster.height
	/// Rounder than TVPoster.cornerRadius on purpose — the shelf cards sit in
	/// a row where a tight corner reads as crisp, but this one floats alone
	/// over the picture, where the softer corner reads better.
	private static let cornerRadius: CGFloat = 18

	let provider: TrickplayProvider
	let positionSec: Double

	@State private var image: UIImage?

	var body: some View {
		ZStack(alignment: .bottomLeading) {
			// The shelf cards use white 10% here, but they sit on their own
			// dark gradient. This one floats over the picture, where a 10%
			// white fill is just a smudge of the video showing through.
			Color.black.opacity(0.6)

			if let image {
				Image(uiImage: image)
					.resizable()
					.aspectRatio(contentMode: .fill)
			}

			TVPosterScrim()

			Text(formatTime(positionSec))
				.font(.system(size: 20, weight: .medium).monospacedDigit())
				.foregroundStyle(.white)
				.padding(.horizontal, TVPoster.textInsetH)
				.padding(.bottom, TVPoster.textInsetV)
		}
		.frame(width: Self.width, height: Self.height)
		.clipShape(RoundedRectangle(cornerRadius: Self.cornerRadius))
		// No border and no shadow, matching the shelf cards: the white ring
		// was removed there for competing with the focus ring, and the bottom
		// scrim already grounds the card against the video.
		.task(id: provider.tileIndex(forSeconds: positionSec)) {
			// Keep the last frame when a fetch fails or is cancelled by the
			// next tile: blanking to the placeholder for a beat reads as a
			// flicker while scrubbing fast.
			if let next = await provider.thumbnail(forSeconds: positionSec) {
				image = next
			}
		}
	}
}
#endif
