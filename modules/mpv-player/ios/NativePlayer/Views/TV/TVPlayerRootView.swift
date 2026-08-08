#if os(tvOS)
import SwiftUI

/// Phase-1 minimal tvOS root: buffering spinner + error overlay only. The
/// full focus/remote-driven chrome (transport bar, scrubbing, panels,
/// shelves) lands in later phases. Transport input is owned by the hosting
/// view controller's press recognizers, not by SwiftUI focus — nothing here
/// is focusable, so Menu reliably reaches the VC-level recognizer.
struct TVPlayerRootView: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		ZStack {
			if viewModel.isBuffering && viewModel.errorMessage == nil {
				ProgressView()
					.progressViewStyle(.circular)
					.tint(.white)
					.scaleEffect(1.6)
			}

			if let message = viewModel.errorMessage {
				errorOverlay(message: message)
			}
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity)
	}

	/// No Close button on TV — the Menu press dismisses (VC recognizer).
	private func errorOverlay(message: String) -> some View {
		VStack(spacing: 20) {
			Image(systemName: "exclamationmark.triangle.fill")
				.font(.system(size: 56))
				.foregroundStyle(.yellow)
			Text(viewModel.str("playbackError", "Playback error"))
				.font(.title3)
				.foregroundStyle(.white)
			Text(message)
				.font(.body)
				.foregroundStyle(.white.opacity(0.8))
				.multilineTextAlignment(.center)
				.lineLimit(4)
		}
		.padding(48)
		.frame(maxWidth: 720)
		.background(.black.opacity(0.85), in: RoundedRectangle(cornerRadius: 24))
	}
}
#endif
