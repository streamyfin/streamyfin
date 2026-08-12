#if os(iOS)
import SwiftUI

/// "Skip Intro" / "Skip Credits" pill, shown while the position is inside a
/// media segment — visible even when the rest of the chrome is hidden.
struct SkipSegmentButton: View {
	@ObservedObject var viewModel: PlayerViewModel
	let segment: MediaSegmentRecord

	var body: some View {
		Button {
			viewModel.skipActiveSegment()
		} label: {
			HStack(spacing: 6) {
				Text(label)
					.font(.subheadline.weight(.semibold))
				Image(systemName: "forward.fill")
					.font(.system(size: 12, weight: .semibold))
			}
			.foregroundStyle(.white)
			.padding(.horizontal, 18)
			.padding(.vertical, 10)
			.background(.ultraThinMaterial, in: Capsule())
			.overlay(Capsule().stroke(.white.opacity(0.25), lineWidth: 1))
		}
	}

	private var label: String {
		segment.type == "Outro"
			? viewModel.str("skipCredits", "Skip Credits")
			: viewModel.str("skipIntro", "Skip Intro")
	}
}
#endif
