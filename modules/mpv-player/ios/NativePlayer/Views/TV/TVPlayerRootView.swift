#if os(tvOS)
import SwiftUI

/// tvOS root overlay. Phase 2: show/hide chrome with a bottom transport bar
/// (progress + times + ends-at) and a top-left metadata header. Nothing here
/// is focusable — all transport input arrives through the hosting view
/// controller's press recognizers, so Menu reliably reaches the VC. SwiftUI
/// focus enters only with the panels/shelves of later phases.
@available(tvOS 26.0, *)
struct TVPlayerRootView: View {
	@ObservedObject var viewModel: PlayerViewModel
	/// Focus memory for the button row — lives here because the row unmounts
	/// whenever the chrome hides, and should reappear on the same control.
	@State private var lastFocusedControl: TVControl?

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
					VStack(alignment: .leading, spacing: 30) {
						if viewModel.controlsVisible, !viewModel.isScrubbing {
							TVControlsRow(
								viewModel: viewModel,
								lastFocused: $lastFocusedControl
							)
						}
						TVTransportBar(viewModel: viewModel, time: viewModel.time)
					}
				}
				.padding(.horizontal, 80)
				.padding(.vertical, 60)
				.transition(.opacity)
			}

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

			// Skip pill (Select) / countdown card (Select or Play-Pause) stay
			// actionable while the chrome is hidden, via the VC recognizers.
			// In the full chrome the pill yields to the row's focusable Skip
			// button — a non-focusable pill next to focusable glass buttons
			// reads as a control that focus can never reach.
			if !viewModel.showEpisodeList {
				VStack {
					Spacer()
					HStack {
						Spacer()
						if let countdown = viewModel.countdownRemaining,
							let next = viewModel.nextEpisode {
							TVCountdownCard(
								viewModel: viewModel, next: next, remaining: countdown)
						} else if let segment = viewModel.activeSegment,
							!viewModel.controlsVisible, !viewModel.isScrubbing {
							TVSkipPill(viewModel: viewModel, segment: segment)
						}
					}
				}
				.padding(.trailing, 80)
				.padding(.bottom, viewModel.controlsVisible ? 260 : 80)
			}

			if viewModel.showEpisodeList {
				VStack {
					Spacer()
					TVEpisodeShelf(viewModel: viewModel)
				}
				.transition(.move(edge: .bottom).combined(with: .opacity))
				.zIndex(3)
			}

			if viewModel.showStillWatching {
				TVStillWatchingCard(viewModel: viewModel)
					.zIndex(4)
			}

			if let message = viewModel.errorMessage {
				errorOverlay(message: message)
			}
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity)
		.animation(.easeInOut(duration: 0.2), value: viewModel.controlsVisible)
		.animation(.easeInOut(duration: 0.2), value: viewModel.isScrubbing)
		.animation(.easeInOut(duration: 0.2), value: viewModel.seekFeedbackVisible)
		.animation(.easeInOut(duration: 0.2), value: viewModel.activeSegment?.startSec)
		.animation(.easeInOut(duration: 0.2), value: viewModel.countdownRemaining != nil)
		.animation(.easeInOut(duration: 0.25), value: viewModel.showEpisodeList)
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

	/// No Close button on TV — Menu owns dismissal (VC recognizer).
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
/// treatment (thicker track + glow), so the style must add none of the
/// system decor.
@available(tvOS 26.0, *)
private struct TVBareButtonStyle: ButtonStyle {
	func makeBody(configuration: Configuration) -> some View {
		configuration.label
	}
}

/// Bottom transport bar: play-state glyph, progress (played + buffered),
/// position, remaining and the wall-clock finish time. While a remote scrub
/// is armed, the playhead follows the scrub target and a trickplay bubble
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

	private static let bubbleHeight: CGFloat = 180

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
			if let chapterName = viewModel.chapterName(at: position) {
				Text(chapterName)
					.font(.caption)
					.foregroundStyle(.white.opacity(0.7))
					.lineLimit(1)
			}

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
						.shadow(color: .white.opacity(barFocused ? 0.45 : 0), radius: 8)
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
				Text(formatTime(position))
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
	/// shows the trickplay bubble) and take the first step. Every further
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
				Capsule().fill(.white.opacity(0.25))
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
					let chapterName = viewModel.chapterName(at: viewModel.scrubPosition)
					TrickplayBubbleView(
						provider: trickplay,
						positionSec: viewModel.scrubPosition,
						chapterName: chapterName,
						bubbleHeight: Self.bubbleHeight
					)
					.offset(
						x: bubbleOffsetX(trackWidth: width, provider: trickplay, playedFraction: playedFraction),
						y: -Self.bubbleHeight - 90 - (chapterName != nil ? 30 : 0)
					)
				}
			}
		}
	}

	/// Center the bubble over the playhead, clamped to the track bounds.
	private func bubbleOffsetX(
		trackWidth: CGFloat, provider: TrickplayProvider, playedFraction: CGFloat
	) -> CGFloat {
		let bubbleWidth = Self.bubbleHeight * provider.aspectRatio
		let thumbX = trackWidth * playedFraction
		return min(max(thumbX - bubbleWidth / 2, 0), max(trackWidth - bubbleWidth, 0))
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
