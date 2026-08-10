#if os(tvOS)
import SwiftUI

/// The chrome layer of the TV player: scrims, metadata header, the focusable
/// controls row and the transport bar. One of the stacked layer hosts built
/// by NativePlayerViewController — TVFocusCoordinator flips this host into
/// the focus system when the zone is .chrome and points the engine at it
/// after SwiftUI commits, so the row's prefersDefaultFocus memory is honored
/// on the engine's first pick. The status/shelf/subtitle-search/
/// still-watching/error layers live in TVOverlayLayers.swift.
@available(tvOS 26.0, *)
struct TVChromeLayerView: View {
	@ObservedObject var viewModel: PlayerViewModel
	let focusCoordinator: TVFocusCoordinator
	/// Focus memory for the button row — lives here because the row unmounts
	/// whenever the chrome hides, and should reappear on the same control.
	@State private var lastFocusedControl: TVControl?

	/// Chrome inset ON TOP OF the tvOS overscan safe area, which SwiftUI has
	/// already applied by the time this runs: the layer hosts are pinned to
	/// the full view bounds, not the safe-area guide, so the system's ~90pt
	/// horizontal / ~60pt vertical insets are inside these. Keep them small —
	/// the old 80/60 put the transport bar ~170pt from the screen edge, far
	/// deeper than the system player.
	private static let insetH: CGFloat = 40
	private static let insetV: CGFloat = 24

	var body: some View {
		ZStack {
			// The bar also shows alone while a remote scrub is armed with the
			// chrome hidden, and flashes briefly after a blind arrow jump
			// (seek feedback); the button row only in the full (focus) chrome.
			if viewModel.controlsVisible || viewModel.isScrubbing
				|| viewModel.seekFeedbackVisible {
				scrims
				VStack {
					TVMetadataHeader(viewModel: viewModel)
					Spacer()
					// Tight: nothing sits between the button row and the track
					// now that the chapter label moved down under the elapsed
					// time, so the row can sit close to the bar it drives.
					VStack(alignment: .leading, spacing: 16) {
						if viewModel.controlsVisible, !viewModel.isScrubbing {
							TVControlsRow(
								viewModel: viewModel,
								lastFocused: $lastFocusedControl,
								focusCoordinator: focusCoordinator
							)
						}
						TVTransportBar(viewModel: viewModel, time: viewModel.time)
					}
				}
				.padding(.horizontal, Self.insetH)
				.padding(.vertical, Self.insetV)
				.transition(.opacity)
			}
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity)
		.animation(.easeInOut(duration: 0.2), value: viewModel.controlsVisible)
		.animation(.easeInOut(duration: 0.2), value: viewModel.isScrubbing)
		.animation(.easeInOut(duration: 0.2), value: viewModel.seekFeedbackVisible)
	}

	/// Subtitles are burned into the video frames by mpv, so the scrims and
	/// bar never need to dodge them.
	private var scrims: some View {
		VStack(spacing: 0) {
			LinearGradient(
				colors: [Color.black.opacity(0.55), Color.black.opacity(0)],
				startPoint: .top, endPoint: .bottom
			)
			.frame(height: 240)
			Spacer()
			LinearGradient(
				colors: [Color.black.opacity(0), Color.black.opacity(0.55)],
				startPoint: .top, endPoint: .bottom
			)
			.frame(height: 280)
		}
		.ignoresSafeArea()
		.allowsHitTesting(false)
	}
}

/// Title + subtitle ("Series · S2E5" or production year), top-left like the
/// system player.
@available(tvOS 26.0, *)
private struct TVMetadataHeader: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		HStack {
			VStack(alignment: .leading, spacing: 6) {
				if let title = viewModel.metadata?.title {
					Text(title)
						.font(.title3.weight(.semibold))
						.foregroundStyle(.white)
						.lineLimit(1)
				}
				if let subtitle = viewModel.metadata?.subtitle {
					Text(subtitle)
						.font(.callout)
						.foregroundStyle(.white.opacity(0.7))
						.lineLimit(1)
				}
			}
			Spacer()
		}
	}
}

/// Bare style for the focusable transport bar: the bar draws its own focus
/// treatment (the track thickens), so the style must add none of the system
/// decor — every built-in style puts a platter around a progress track.
@available(tvOS 26.0, *)
private struct TVBareButtonStyle: ButtonStyle {
	func makeBody(configuration: Configuration) -> some View {
		configuration.label
	}
}

/// Bottom transport bar: play-state glyph, progress (played + buffered),
/// position, remaining and the wall-clock finish time. While a remote scrub
/// is armed, the playhead follows the scrub target and a trickplay card
/// rides above it. Observes PlaybackTimeModel directly — PlayerViewModel
/// deliberately does not publish the ~30Hz clock (see PlaybackTimeModel).
///
/// The bar is itself a focus target while the chrome is up: Down from the
/// button row lands on it, and Left/Right — a press or a swipe's move
/// command — arm a scrub from the current position. The moment isScrubbing
/// flips, the bar disables itself (dropping out of the focus system) and
/// the re-enabled VC recognizers become the sole owner of every press and
/// pan — Apple's model: Select/Play commit the position, Menu cancels; no
/// auto-resume. When the scrub resolves, the button row remounts and the
/// focus-restore machinery takes over.
@available(tvOS 26.0, *)
private struct TVTransportBar: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ObservedObject var time: PlaybackTimeModel
	@FocusState private var barFocused: Bool

	/// Clearance between the scrub preview card and the track it rides over.
	private static let cardGap: CGFloat = 40

	private static let endsAtFormatter: DateFormatter = {
		let formatter = DateFormatter()
		// The JS player renders hour12:false 2-digit — a fixed 24h format.
		formatter.dateFormat = "HH:mm"
		return formatter
	}()

	var body: some View {
		let position =
			viewModel.isScrubbing ? viewModel.scrubPosition : time.displayPosition
		let duration = viewModel.duration
		let remaining = max(0, duration - position)

		VStack(alignment: .leading, spacing: 12) {
			Button {
				// Select with the bar focused mirrors the system player:
				// toggle play/pause. While a scrub is armed (or the chrome is
				// hidden) the recognizers own Select, so stay quiet then.
				if viewModel.controlsVisible, !viewModel.isScrubbing {
					viewModel.togglePlayPause()
				}
			} label: {
				HStack(spacing: 20) {
					Image(systemName: glyphName)
						.font(.system(size: 24, weight: .semibold))
						.foregroundStyle(.white)

					progressBar(position: position, duration: duration)
						.frame(height: barHeight)
				}
			}
			.buttonStyle(TVBareButtonStyle())
			.focused($barFocused)
			.onMoveCommand { handleMove($0) }
			// Only a focus target in the idle full chrome. The moment ANY
			// scrub arms — including one armed from this very bar — the VC
			// recognizers re-enable and must be the SOLE owner of the remote:
			// a still-focused bar would also receive the committing Select,
			// and its play/pause action (running after endScrub flipped
			// isScrubbing) would instantly pause the freshly resumed video.
			// Likewise the hidden-chrome bar-only states (pan scrub, seek
			// feedback) and the shelf/still-watching overlays own the remote
			// without the bar competing for focus.
			.disabled(
				!viewModel.controlsVisible || viewModel.isScrubbing
					|| viewModel.showEpisodeList || viewModel.showStillWatching)
			.onChange(of: barFocused) { focused in
				// Moving focus onto the bar is interaction too.
				if focused {
					viewModel.scheduleAutoHide()
				}
			}

			HStack(alignment: .top) {
				// Chapter sits under the elapsed time, mirroring the ends-at
				// line under the remaining time on the right — same size and
				// opacity, so the two secondary lines read as a pair.
				VStack(alignment: .leading, spacing: 2) {
					Text(formatTime(position))
					if let chapterName = viewModel.chapterName(at: position) {
						Text(chapterName)
							.font(.system(size: 20))
							.foregroundStyle(.white.opacity(0.55))
							.lineLimit(1)
					}
				}
				Spacer()
				VStack(alignment: .trailing, spacing: 2) {
					Text("-" + formatTime(remaining))
					if duration > 0 {
						Text(endsAtLabel(remaining: remaining))
							.font(.system(size: 20).monospacedDigit())
							.foregroundStyle(.white.opacity(0.55))
					}
				}
			}
			.font(.system(size: 26).monospacedDigit())
			.foregroundStyle(.white.opacity(0.85))
			.padding(.leading, 44)
		}
		.animation(
			.spring(response: 0.25, dampingFraction: 0.9), value: viewModel.isScrubbing)
		.animation(.easeOut(duration: 0.15), value: barFocused)
	}

	private var glyphName: String {
		if viewModel.isScrubbing { return "backward.frame.fill" }
		return viewModel.isPlaying ? "play.fill" : "pause.fill"
	}

	private var barHeight: CGFloat {
		viewModel.isScrubbing || barFocused ? 14 : 10
	}

	private func handleMove(_ direction: MoveCommandDirection) {
		// Mid-scrub (and in the hidden-chrome states) the VC recognizers own
		// every press — reacting here too would double-nudge. Swallowing the
		// command without acting is intentional: it keeps focus pinned.
		guard viewModel.controlsVisible, !viewModel.isScrubbing else { return }
		switch direction {
		case .left:
			armScrub(nudge: -viewModel.seekBackwardSec)
		case .right:
			armScrub(nudge: viewModel.seekForwardSec)
		case .up:
			// Hand focus back to the button row.
			barFocused = false
		default:
			break
		}
	}

	/// First horizontal input on the focused bar: arm the scrub (pauses,
	/// shows the trickplay card) and take the first step. Every further
	/// press/pan is handled by the VC recognizers, which re-enable the
	/// moment isScrubbing flips.
	private func armScrub(nudge delta: Double) {
		guard viewModel.isReadyToSeek, viewModel.duration > 0,
			viewModel.errorMessage == nil
		else { return }
		viewModel.beginScrub()
		viewModel.updateScrub(
			fraction: (viewModel.scrubPosition + delta) / viewModel.duration)
	}

	private func progressBar(position: Double, duration: Double) -> some View {
		GeometryReader { geometry in
			let width = geometry.size.width
			let playedFraction = duration > 0 ? min(max(position / duration, 0), 1) : 0
			let bufferedFraction =
				duration > 0
				? min(max((time.displayPosition + time.cacheSeconds) / duration, 0), 1)
				: 0

			ZStack(alignment: .leading) {
				// Unplayed track: Liquid Glass, same material as the buttons
				// above it. It samples the video behind the bar, so the
				// specular highlight travels with the picture instead of being
				// a painted-on tint.
				Color.clear.glassEffect(.regular, in: Capsule())
				Capsule()
					.fill(.white.opacity(0.35))
					.frame(width: width * bufferedFraction)
				Capsule()
					.fill(.white)
					.frame(width: width * playedFraction)

				// Chapter ticks (skip the implicit chapter at 0)
				ForEach(Array(viewModel.chapters.enumerated()), id: \.offset) { _, chapter in
					if chapter.startSec > 0, duration > 0 {
						RoundedRectangle(cornerRadius: 1)
							.fill(.black.opacity(0.55))
							.frame(width: 3, height: geometry.size.height - 2)
							.offset(
								x: width * CGFloat(min(max(chapter.startSec / duration, 0), 1)) - 1.5)
					}
				}
			}
			.overlay(alignment: .topLeading) {
				if viewModel.isScrubbing, let trickplay = viewModel.trickplay,
					trickplay.isAvailable {
					TVTrickplayCard(
						provider: trickplay,
						positionSec: viewModel.scrubPosition
					)
					.offset(
						x: cardOffsetX(trackWidth: width, playedFraction: playedFraction),
						y: -TVTrickplayCard.height - Self.cardGap
					)
				}
			}
		}
	}

	/// Center the card over the playhead, clamped to the track bounds.
	private func cardOffsetX(trackWidth: CGFloat, playedFraction: CGFloat) -> CGFloat {
		let thumbX = trackWidth * playedFraction
		return min(
			max(thumbX - TVTrickplayCard.width / 2, 0),
			max(trackWidth - TVTrickplayCard.width, 0))
	}

	/// Wall-clock finish time. The i18n template carries a %TIME% placeholder;
	/// translations without one (e.g. sv "slutar") get the time appended.
	private func endsAtLabel(remaining: Double) -> String {
		// Real remaining wall time, not speed-adjusted — matches the JS player.
		let time = Self.endsAtFormatter.string(from: Date().addingTimeInterval(remaining))
		let template = viewModel.str("endsAt", "Ends at %TIME%")
		if template.contains("%TIME%") {
			return template.replacingOccurrences(of: "%TIME%", with: time)
		}
		return "\(template) \(time)"
	}
}
#endif
