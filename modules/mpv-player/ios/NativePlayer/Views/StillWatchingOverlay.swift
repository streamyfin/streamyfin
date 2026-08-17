#if os(iOS)
import SwiftUI

/// "Are you still watching?" — shown at EOF when the autoplay episode cap is
/// reached (mirror of the JS ContinueWatchingOverlay). Continue advances and
/// resets the chain counter JS-side; Go back closes the player. Modal by
/// design: the scrim swallows taps so the chrome can't be toggled beneath it.
struct StillWatchingOverlay: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		ZStack {
			Color.black.opacity(0.75)
				.ignoresSafeArea()
				.onTapGesture {}

			VStack(spacing: 14) {
				Text(viewModel.str("stillWatching", "Are you still watching?"))
					.font(.title2.weight(.bold))
					.foregroundStyle(.white)
					.multilineTextAlignment(.center)
					.padding(.bottom, 10)

				Button {
					viewModel.continueWatchingTapped()
				} label: {
					Text(viewModel.str("continueWatching", "Continue watching"))
						.font(.headline)
						.foregroundStyle(.black)
						.frame(maxWidth: .infinity)
						.padding(.vertical, 13)
						.background(.white, in: Capsule())
				}

				Button {
					viewModel.stillWatchingCloseTapped()
				} label: {
					Text(viewModel.str("goBack", "Go back"))
						.font(.headline)
						.foregroundStyle(.white.opacity(0.85))
						.frame(maxWidth: .infinity)
						.padding(.vertical, 13)
				}
			}
			.frame(maxWidth: 320)
			.padding(.horizontal, 24)
		}
	}
}
#endif
