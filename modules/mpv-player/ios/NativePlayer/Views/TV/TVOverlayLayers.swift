#if os(tvOS)
import SwiftUI

/// Thin per-host layer roots. NativePlayerViewController stacks one hosting
/// controller per layer (back-to-front: chrome, status, shelf, subtitle
/// search, still watching, error) and TVFocusCoordinator flips exactly one
/// of the focusable ones into the focus system at a time. Each layer carries
/// its own transition/animation — the conditions and values mirror the old
/// single-ZStack root view exactly.

/// Display-only status layer: buffering spinner, technical info, and the
/// skip pill / countdown card. Nothing here is ever focusable — the pill and
/// card are actioned via the VC's Select recognizer while the chrome is
/// hidden; in the full chrome the controls row hosts focusable equivalents.
/// Its host view stays isUserInteractionEnabled = false permanently.
@available(tvOS 26.0, *)
struct TVStatusLayerView: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		ZStack {
			if viewModel.isBuffering && viewModel.errorMessage == nil {
				ProgressView()
					.progressViewStyle(.circular)
					.tint(.white)
					.scaleEffect(1.6)
			}

			// Stats for nerds — independent of the chrome, like on iOS. The
			// shared overlay is phone-sized; scale it up for viewing distance.
			if viewModel.showTechnicalInfo {
				VStack {
					HStack {
						TechnicalInfoOverlay(viewModel: viewModel)
							.scaleEffect(1.5, anchor: .topLeading)
						Spacer()
					}
					Spacer()
				}
				.padding(.top, 60)
				.padding(.leading, 80)
			}

			// Skip pill / countdown card (Select acts on both) stay
			// actionable while the chrome is hidden, via the VC recognizers.
			// In the full chrome both yield to the row's focusable Skip /
			// Next-episode buttons — focus owns the remote there, so a
			// non-focusable card next to focusable glass buttons reads as a
			// control that focus can never reach.
			if !viewModel.controlsVisible, !viewModel.showEpisodeList,
				!viewModel.showSubtitleSearch {
				VStack {
					Spacer()
					HStack {
						Spacer()
						if let countdown = viewModel.countdownRemaining,
							let next = viewModel.nextEpisode {
							TVCountdownCard(
								viewModel: viewModel, next: next, remaining: countdown)
						} else if let segment = viewModel.activeSegment,
							!viewModel.isScrubbing {
							TVSkipPill(viewModel: viewModel, segment: segment)
						}
					}
				}
				.padding(.trailing, 80)
				.padding(.bottom, 80)
			}
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity)
		.animation(.easeInOut(duration: 0.2), value: viewModel.controlsVisible)
		.animation(.easeInOut(duration: 0.2), value: viewModel.activeSegment?.startSec)
		.animation(.easeInOut(duration: 0.2), value: viewModel.countdownRemaining != nil)
		.animation(.easeInOut(duration: 0.25), value: viewModel.showEpisodeList)
		.animation(.easeInOut(duration: 0.2), value: viewModel.showSubtitleSearch)
	}
}

/// Episode shelf layer (focus zone: .shelf).
@available(tvOS 26.0, *)
struct TVShelfLayerView: View {
	@ObservedObject var viewModel: PlayerViewModel
	let focusCoordinator: TVFocusCoordinator

	var body: some View {
		ZStack {
			if viewModel.showEpisodeList {
				VStack {
					Spacer()
					TVEpisodeShelf(viewModel: viewModel, focusCoordinator: focusCoordinator)
				}
				.transition(.move(edge: .bottom).combined(with: .opacity))
			}
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity)
		.animation(.easeInOut(duration: 0.25), value: viewModel.showEpisodeList)
	}
}

/// Remote subtitle search layer (focus zone: .subtitleSearch).
@available(tvOS 26.0, *)
struct TVSubtitleSearchLayerView: View {
	@ObservedObject var viewModel: PlayerViewModel
	let focusCoordinator: TVFocusCoordinator

	var body: some View {
		ZStack {
			if viewModel.showSubtitleSearch {
				TVSubtitleSearchPanel(viewModel: viewModel, focusCoordinator: focusCoordinator)
					.transition(.opacity)
			}
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity)
		.animation(.easeInOut(duration: 0.2), value: viewModel.showSubtitleSearch)
	}
}

/// "Are you still watching?" layer (focus zone: .stillWatching) — the
/// top-most focusable layer, matching its old zIndex(5).
@available(tvOS 26.0, *)
struct TVStillWatchingLayerView: View {
	@ObservedObject var viewModel: PlayerViewModel
	let focusCoordinator: TVFocusCoordinator

	var body: some View {
		ZStack {
			if viewModel.showStillWatching {
				TVStillWatchingCard(viewModel: viewModel, focusCoordinator: focusCoordinator)
			}
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity)
	}
}

/// Playback-error layer. Display-only (no Close button on TV — Menu owns
/// dismissal via the VC recognizer) and stacked above everything, matching
/// its old last-in-ZStack position.
@available(tvOS 26.0, *)
struct TVErrorLayerView: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		ZStack {
			if let message = viewModel.errorMessage {
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
		.frame(maxWidth: .infinity, maxHeight: .infinity)
	}
}
#endif
