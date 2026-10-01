import SwiftUI

enum NativeSyncPlayAction: String, CaseIterable {
	case schedulePlay = "schedule-play"
	case unpause, pause, seek, buffering
	case waitPause = "wait-pause"
	case waitUnpause = "wait-unpause"

	var symbol: String {
		switch self {
		case .schedulePlay: return "arrow.triangle.2.circlepath"
		case .unpause: return "play.circle"
		case .pause: return "pause.circle"
		case .seek: return "arrow.clockwise"
		case .buffering, .waitPause, .waitUnpause: return "clock"
		}
	}

	var secondarySymbol: String? {
		switch self {
		case .schedulePlay, .waitUnpause: return "play.fill"
		case .waitPause: return "pause.fill"
		default: return nil
		}
	}

	var repeatsPulse: Bool { self != .unpause && self != .pause }
}

/// Only the label changes: loading and SyncPlay transitions never replace
/// the transport button or its TV focus identity.
struct PlayerPlaybackIcon: View {
	let syncPlayAction: String?
	let isBuffering: Bool
	let isPlaying: Bool
	let size: CGFloat
	var color: Color? = .white
	var syncPlayColor: Color? = Color(red: 0, green: 164.0 / 255, blue: 220.0 / 255)

	var body: some View {
		Group {
			if let action = syncPlayAction.flatMap(NativeSyncPlayAction.init(rawValue:)) {
				NativeSyncPlayActionIcon(action: action, size: size)
					.id(action)
					.foregroundColor(syncPlayColor)
			} else if isBuffering {
				ProgressView()
					.controlSize(.regular)
					.tint(color)
			} else {
				Image(systemName: isPlaying ? "pause.fill" : "play.fill")
					.font(.system(size: size, weight: .bold))
					.foregroundColor(color)
			}
		}
		.frame(width: size, height: size)
		.accessibilityHidden(true)
	}
}

private struct NativeSyncPlayActionIcon: View {
	let action: NativeSyncPlayAction
	let size: CGFloat
	@Environment(\.accessibilityReduceMotion) private var reduceMotion
	@State private var scale: CGFloat = 1
	@State private var rotation: Double = 0

	var body: some View {
		ZStack(alignment: action == .schedulePlay ? .center : .bottomTrailing) {
			Image(systemName: action.symbol)
				.font(.system(size: size, weight: .regular))
				.frame(width: size, height: size)
				.rotationEffect(.degrees(rotation))
			if let secondary = action.secondarySymbol {
				Image(systemName: secondary)
					.font(.system(size: size * 0.42, weight: .semibold))
					.frame(width: size * 0.42, height: size * 0.42)
			}
		}
		.frame(width: size, height: size)
		.scaleEffect(scale)
		.task(id: reduceMotion) {
			guard !reduceMotion else {
				scale = 1
				rotation = 0
				return
			}
			if action == .schedulePlay {
				withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
					rotation = 360
				}
			}
			if action.repeatsPulse {
				withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) {
					scale = 1.1
				}
			} else {
				withAnimation(.easeOut(duration: 0.22)) { scale = 1.2 }
				do {
					try await Task.sleep(nanoseconds: 220_000_000)
				} catch { return }
				withAnimation(.easeInOut(duration: 0.22)) { scale = 1 }
			}
		}
	}
}

#if os(iOS)
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
				PlayerPlaybackIcon(
					syncPlayAction: viewModel.syncPlayEnabled ? viewModel.syncPlayAction : nil,
					isBuffering: viewModel.isBuffering,
					isPlaying: viewModel.isPlaying,
					size: m.playIconSize
				)
					.frame(width: m.playButton, height: m.playButton)
					.contentShape(Rectangle())
			}
			.accessibilityLabel(viewModel.playbackToggleLabel)

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

	// seekSymbol lives in Views/TimeFormatting.swift (shared with the
	// double-tap seek feedback pill).

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
