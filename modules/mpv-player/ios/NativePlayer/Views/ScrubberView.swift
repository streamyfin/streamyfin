#if os(iOS)
import SwiftUI

/// Custom scrubber modeled on the iOS system player: capsule track with
/// buffered range, elapsed fill, chapter ticks, a full-width 44pt drag
/// surface, and a trickplay preview bubble anchored to the drag position.
/// SwiftUI's Slider can render none of that, hence hand-rolled.
struct ScrubberView: View {
	@ObservedObject var viewModel: PlayerViewModel

	private var trackHeight: CGFloat { viewModel.isScrubbing ? 11 : 7 }

	var body: some View {
		GeometryReader { geometry in
			let width = geometry.size.width
			let progressFraction = fraction(of: viewModel.isScrubbing ? viewModel.scrubPosition : viewModel.displayPosition)
			let bufferedFraction = fraction(of: viewModel.displayPosition + viewModel.cacheSeconds)

			ZStack(alignment: .leading) {
				// Track
				Capsule()
					.fill(.white.opacity(0.25))
					.frame(height: trackHeight)

				// Buffered
				Capsule()
					.fill(.white.opacity(0.4))
					.frame(width: max(trackHeight, width * bufferedFraction), height: trackHeight)

				// Elapsed
				Capsule()
					.fill(.white)
					.frame(width: max(trackHeight, width * progressFraction), height: trackHeight)

				// Chapter ticks (skip the implicit chapter at 0)
				ForEach(Array(viewModel.chapters.enumerated()), id: \.offset) { _, chapter in
					if chapter.startSec > 0 {
						RoundedRectangle(cornerRadius: 1)
							.fill(.black.opacity(0.55))
							.frame(width: 2, height: trackHeight - 2)
							.offset(x: width * fraction(of: chapter.startSec) - 1)
					}
				}
			}
			.frame(height: 44)
			.frame(maxHeight: .infinity, alignment: .center)
			.contentShape(Rectangle())
			.gesture(
				DragGesture(minimumDistance: 0)
					.onChanged { value in
						if !viewModel.isScrubbing {
							viewModel.beginScrub()
						}
						viewModel.updateScrub(fraction: value.location.x / width)
					}
					.onEnded { _ in
						viewModel.endScrub()
					}
			)
			.overlay(alignment: .topLeading) {
				if viewModel.isScrubbing, let trickplay = viewModel.trickplay, trickplay.isAvailable {
					let chapterName = viewModel.chapterName(at: viewModel.scrubPosition)
					TrickplayBubbleView(
						provider: trickplay,
						positionSec: viewModel.scrubPosition,
						chapterName: chapterName
					)
					.offset(
						x: bubbleOffsetX(trackWidth: width, provider: trickplay),
						y: -TrickplayBubbleView.height - 12 - (chapterName != nil ? 18 : 0)
					)
				}
			}
		}
		.frame(height: 44)
		.animation(.spring(response: 0.25, dampingFraction: 0.9), value: viewModel.isScrubbing)
	}

	private func fraction(of position: Double) -> CGFloat {
		guard viewModel.duration > 0 else { return 0 }
		return CGFloat(min(max(position / viewModel.duration, 0), 1))
	}

	/// Center the bubble over the thumb, clamped to the track bounds.
	private func bubbleOffsetX(trackWidth: CGFloat, provider: TrickplayProvider) -> CGFloat {
		let bubbleWidth = TrickplayBubbleView.height * provider.aspectRatio
		let thumbX = trackWidth * fraction(of: viewModel.scrubPosition)
		return min(max(thumbX - bubbleWidth / 2, 0), max(trackWidth - bubbleWidth, 0))
	}
}
#endif
