#if os(iOS)
import SwiftUI

/// Center transport row: previous episode (episodes only), seek back,
/// previous/next chapter (chaptered items only), play/pause, seek forward,
/// next episode (episodes only).
///
/// The row has a fixed natural width (buttons + spacing), which in portrait
/// can exceed the screen — and an overflowing child inflates the root ZStack,
/// dragging the bars and edge sliders off screen with it. ViewThatFits steps
/// the density down until the row fits the available width.
struct PlayerCenterControls: View {
	@ObservedObject var viewModel: PlayerViewModel
	/// Not read directly, but hasPrevious/hasNextChapter derive from the
	/// playback clock — observing it keeps the chapter buttons' enabled
	/// state fresh as playback crosses chapter marks.
	@ObservedObject var time: PlaybackTimeModel

	private var hasChapters: Bool { !viewModel.chapters.isEmpty }

	var body: some View {
		ViewThatFits(in: .horizontal) {
			row(.regular)
			row(.compact)
			row(.dense)
			// Last resort (narrow portrait with chapters): drop the episode
			// prev/next buttons — the JS player never has them in the center
			// row either, and the episode list / countdown / top bar keep
			// episode navigation reachable.
			row(.dense, includeEpisodeButtons: false)
		}
	}

	// MARK: - Density tiers

	private struct RowMetrics {
		let spacing: CGFloat
		let sideButton: CGFloat
		let playButton: CGFloat
		/// Seek forward/backward glyphs.
		let seekIconSize: CGFloat
		/// Episode/chapter jump glyphs.
		let jumpIconSize: CGFloat
		let playIconSize: CGFloat
	}

	private enum Density {
		case regular, compact, dense
	}

	private func metrics(for density: Density) -> RowMetrics {
		switch density {
		case .regular:
			return RowMetrics(
				spacing: hasChapters ? 24 : 36,
				sideButton: 56, playButton: 80,
				seekIconSize: 30, jumpIconSize: 22, playIconSize: 48
			)
		case .compact:
			return RowMetrics(
				spacing: hasChapters ? 14 : 24,
				sideButton: 48, playButton: 68,
				seekIconSize: 26, jumpIconSize: 19, playIconSize: 40
			)
		case .dense:
			return RowMetrics(
				spacing: 10,
				sideButton: 40, playButton: 56,
				seekIconSize: 22, jumpIconSize: 17, playIconSize: 34
			)
		}
	}

	// MARK: - Row

	private func row(_ density: Density, includeEpisodeButtons: Bool = true) -> some View {
		let m = metrics(for: density)
		let showEpisodeButtons = includeEpisodeButtons && viewModel.metadata?.isEpisode == true
		return HStack(spacing: m.spacing) {
			if showEpisodeButtons {
				controlButton(systemName: "backward.end.fill", iconSize: m.jumpIconSize, frame: m.sideButton) {
					viewModel.playPreviousEpisode()
				}
			}

			controlButton(
				systemName: seekSymbol(prefix: "gobackward", seconds: viewModel.seekBackwardSec),
				iconSize: m.seekIconSize,
				frame: m.sideButton
			) {
				viewModel.seekBackward()
			}

			if hasChapters {
				controlButton(systemName: "backward.fill", iconSize: m.jumpIconSize, frame: m.sideButton) {
					viewModel.goToPreviousChapter()
				}
				.opacity(viewModel.hasPreviousChapter ? 1 : 0.3)
				.disabled(!viewModel.hasPreviousChapter)
			}

			Button {
				viewModel.togglePlayPause()
			} label: {
				Image(systemName: viewModel.isPlaying ? "pause.fill" : "play.fill")
					.font(.system(size: m.playIconSize, weight: .bold))
					.foregroundStyle(.white)
					.frame(width: m.playButton, height: m.playButton)
					.contentShape(Rectangle())
			}
			.opacity(viewModel.isBuffering ? 0 : 1)

			if hasChapters {
				controlButton(systemName: "forward.fill", iconSize: m.jumpIconSize, frame: m.sideButton) {
					viewModel.goToNextChapter()
				}
				.opacity(viewModel.hasNextChapter ? 1 : 0.3)
				.disabled(!viewModel.hasNextChapter)
			}

			controlButton(
				systemName: seekSymbol(prefix: "goforward", seconds: viewModel.seekForwardSec),
				iconSize: m.seekIconSize,
				frame: m.sideButton
			) {
				viewModel.seekForward()
			}

			if showEpisodeButtons {
				controlButton(systemName: "forward.end.fill", iconSize: m.jumpIconSize, frame: m.sideButton) {
					viewModel.playNextEpisode()
				}
				.opacity(viewModel.nextEpisode != nil ? 1 : 0.35)
				.disabled(viewModel.nextEpisode == nil)
			}
		}
	}

	/// SF Symbols only ship numbered seek glyphs for specific intervals.
	private func seekSymbol(prefix: String, seconds: Double) -> String {
		let supported: Set<Int> = [5, 10, 15, 30, 45, 60, 75, 90]
		// Int(_: Double) traps on non-finite input; this runs in body, so a
		// bad persisted skip-time setting must degrade, not crash.
		guard let rounded = Int(exactly: seconds.rounded()) else { return prefix }
		return supported.contains(rounded) ? "\(prefix).\(rounded)" : prefix
	}

	private func controlButton(
		systemName: String,
		iconSize: CGFloat,
		frame: CGFloat,
		action: @escaping () -> Void
	) -> some View {
		Button(action: action) {
			Image(systemName: systemName)
				.font(.system(size: iconSize, weight: .semibold))
				.foregroundStyle(.white)
				.frame(width: frame, height: frame)
				.contentShape(Rectangle())
		}
	}
}
#endif
