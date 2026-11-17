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

	/// The remote screen's fixed sizes and look; nil keeps the chrome's density tiers.
	var style: TransportStyle?

	private var hasChapters: Bool { !viewModel.chapters.isEmpty }

	var body: some View {
		Group {
			if let style {
				discRow(style)
			} else {
				tiers
			}
		}
		// Media controls keep their left-to-right order in right-to-left languages, seek back on the left, as the
		// position bar's timeline and the remote artwork's double tap halves do.
		.environment(\.layoutDirection, .leftToRight)
	}

	private var tiers: some View {
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
		let showEpisodeButtons = includeEpisodeButtons && (viewModel.isSyncPlayActive || viewModel.metadata?.isEpisode == true)
		return HStack(spacing: m.spacing) {
			if showEpisodeButtons {
				controlButton(systemName: "backward.end.fill", iconSize: m.jumpIconSize, frame: m.sideButton) {
					viewModel.playPreviousEpisode()
				}
				.disabled(viewModel.isSyncPlayActive && viewModel.syncPlay?.hasPrevious != true)
			}

			seekButton(prefix: "gobackward", seconds: viewModel.seekBackwardSec, iconSize: m.seekIconSize, frame: m.sideButton) {
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

			seekButton(prefix: "goforward", seconds: viewModel.seekForwardSec, iconSize: m.seekIconSize, frame: m.sideButton) {
				viewModel.seekForward()
			}

			if showEpisodeButtons {
				controlButton(systemName: "forward.end.fill", iconSize: m.jumpIconSize, frame: m.sideButton) {
					viewModel.playNextEpisode()
				}
				.opacity((viewModel.isSyncPlayActive ? viewModel.syncPlay?.hasNext == true : viewModel.nextEpisode != nil) ? 1 : 0.35)
				.disabled(viewModel.isSyncPlayActive ? viewModel.syncPlay?.hasNext != true : viewModel.nextEpisode == nil)
			}
		}
	}

	// MARK: - Remote row

	/// Previous, back, play, forward, next at fixed sizes: play a white disc with a dark icon and its loading ring
	/// inside, no chapter buttons (the "more" menu has the chapters).
	private func discRow(_ s: TransportStyle) -> some View {
		let showEpisodeButtons = viewModel.isSyncPlayActive || viewModel.metadata?.isEpisode == true
		return FittingGapStack(gap: s.gap) {
			if showEpisodeButtons {
				controlButton(systemName: "backward.end.fill", iconSize: 22, frame: s.side) {
					viewModel.playPreviousEpisode()
				}
				.disabled(viewModel.isSyncPlayActive && viewModel.syncPlay?.hasPrevious != true)
			}

			seekButton(prefix: "gobackward", seconds: viewModel.seekBackwardSec, iconSize: 28, frame: s.seek) {
				viewModel.seekBackward()
			}

			Button {
				viewModel.togglePlayPause()
			} label: {
				ZStack {
					Circle().fill(.white)
					if viewModel.isBuffering {
						ProgressView().tint(.black)
					} else {
						Image(systemName: viewModel.isPlaying ? "pause.fill" : "play.fill")
							.font(.system(size: s.play * 0.42, weight: .bold))
							.foregroundStyle(.black)
					}
				}
				.frame(width: s.play, height: s.play)
				.contentShape(Circle())
			}

			seekButton(prefix: "goforward", seconds: viewModel.seekForwardSec, iconSize: 28, frame: s.seek) {
				viewModel.seekForward()
			}

			if showEpisodeButtons {
				controlButton(systemName: "forward.end.fill", iconSize: 22, frame: s.side) {
					viewModel.playNextEpisode()
				}
				.opacity((viewModel.isSyncPlayActive ? viewModel.syncPlay?.hasNext == true : viewModel.nextEpisode != nil) ? 1 : 0.35)
				.disabled(viewModel.isSyncPlayActive ? viewModel.syncPlay?.hasNext != true : viewModel.nextEpisode == nil)
			}
		}
	}

	private func seekButton(
		prefix: String,
		seconds: Double,
		iconSize: CGFloat,
		frame: CGFloat,
		action: @escaping () -> Void
	) -> some View {
		Button(action: action) {
			SeekGlyph(prefix: prefix, seconds: seconds, size: iconSize)
				.foregroundStyle(.white)
				.frame(width: frame, height: frame)
				.contentShape(Rectangle())
		}
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

/// The remote transport's row: its buttons at their own sizes, `gap` apart, or closer when the width offered is
/// narrower than the buttons and their gaps (RemoteTransport.fittingGap). An HStack at a fixed spacing spilled past
/// a narrow column instead.
struct FittingGapStack: Layout {
	let gap: CGFloat

	func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
		let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
		let buttons = sizes.reduce(0) { $0 + $1.width }
		let natural = buttons + gap * CGFloat(max(sizes.count - 1, 0))
		// Never narrower than the buttons alone: a gap may give way, a button may not.
		let width = proposal.width.map { max(min($0, natural), buttons) } ?? natural
		return CGSize(width: width, height: sizes.map(\.height).max() ?? 0)
	}

	func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
		let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
		let buttons = sizes.reduce(0) { $0 + $1.width }
		let fitted = CGFloat(RemoteTransport.fittingGap(
			width: Double(bounds.width), buttons: Double(buttons), count: sizes.count, gap: Double(gap)
		))
		var x = bounds.minX + max((bounds.width - buttons - fitted * CGFloat(max(sizes.count - 1, 0))) / 2, 0)
		for (subview, size) in zip(subviews, sizes) {
			subview.place(at: CGPoint(x: x, y: bounds.midY), anchor: .leading, proposal: ProposedViewSize(size))
			x += size.width + fitted
		}
	}
}

/// The transport's sizes when a screen fixes them (the remote one), in points.
struct TransportStyle: Equatable {
	let side: CGFloat
	let seek: CGFloat
	let play: CGFloat
	let gap: CGFloat

	init(_ t: RemoteTransport) {
		side = CGFloat(t.side)
		seek = CGFloat(t.seek)
		play = CGFloat(t.play)
		gap = CGFloat(t.gap)
	}
}
#endif
