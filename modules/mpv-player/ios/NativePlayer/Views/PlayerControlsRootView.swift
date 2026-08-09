#if os(iOS)
import Combine
import SwiftUI
import UIKit

/// Root overlay for the presented native player. Flat dark look modeled on
/// the iOS system player: white SF Symbols, gradient scrims, monospaced-digit
/// time labels. Subtitles are burned into the video frames by mpv
/// (avfoundation-composite-osd), so this overlay never has to dodge them.
struct PlayerControlsRootView: View {
	@ObservedObject var viewModel: PlayerViewModel

	private enum DragAxis { case horizontal, vertical }

	// One gesture session on the background surface: the axis locks on the
	// first movement and sticks for the whole drag (mirror of the JS
	// useGestureDetection).
	@State private var dragAxis: DragAxis?
	@State private var dragOnLeftHalf = false
	@State private var dragStartFraction: Double = 0
	@State private var dragStartLevel: Double = 0
	/// A pinch or an engaged 2× hold took over this touch sequence — the drag
	/// must stay dead until the fingers lift, or its accumulated translation
	/// (finger spread / hold drift) would scrub or yank the sliders against a
	/// stale baseline.
	@State private var dragSuppressed = false

	/// Points of vertical travel for a full 0→1 volume/brightness swing.
	private let verticalDragRange: CGFloat = 280

	var body: some View {
		GeometryReader { geometry in
			// Portrait phones can't fit the full top-bar button row — late
			// data pushes (episode list) add buttons after load, so the bar
			// must adapt by width, not by content.
			content(size: geometry.size)
		}
	}

	private func content(size: CGSize) -> some View {
		ZStack {
			// Tap-to-toggle catcher behind everything interactive; also the
			// gesture surface — controls layered above receive their own
			// touches first, so drags here only start on empty video area.
			Color.clear
				.contentShape(Rectangle())
				.onTapGesture { viewModel.toggleControls() }
				.gesture(surfaceDragGesture(size: size))
				.gesture(holdSpeedGesture)

			if viewModel.controlsVisible {
				scrims
				// zIndex lifts the bars above the center-controls layer below:
				// the trickplay bubble pops up out of the bottom bar's scrubber
				// and must cover the play/skip buttons in landscape, not duck
				// under them. Hit-testing is unaffected — the layer's empty
				// middle isn't tappable.
				controls(compact: size.width < 500)
					.transition(.opacity)
					.zIndex(1)
				// Centered in the ZStack (true screen center) rather than in
				// the bar VStack — the bottom bar is taller than the top bar,
				// so centering between them would sit visibly high. The
				// horizontal padding reserves the edge-slider gutters (20pt
				// inset + 34pt pill + 8pt gap) so the row's ViewThatFits
				// tiers fit BETWEEN the sliders instead of underneath them.
				PlayerCenterControls(viewModel: viewModel, time: viewModel.time)
					.padding(
						.horizontal,
						viewModel.showVolumeSlider || viewModel.showBrightnessSlider ? 62 : 24
					)
					.transition(.opacity)
			}

			if viewModel.isBuffering && !viewModel.isScrubbing && viewModel.errorMessage == nil {
				ProgressView()
					.controlSize(.large)
					.tint(.white)
			}

			// Edge sliders: brightness left, volume right. The volume pill
			// additionally appears alone on hardware volume presses while the
			// chrome is hidden (the system volume HUD is suppressed).
			HStack {
				if viewModel.showBrightnessSlider
					&& (viewModel.controlsVisible || viewModel.brightnessSliderRevealed) {
					BrightnessSliderView(
						viewModel: viewModel,
						controller: viewModel.brightnessController
					)
					.transition(.opacity)
				}
				Spacer()
				if viewModel.showVolumeSlider
					&& (viewModel.controlsVisible || viewModel.volumeSliderRevealed) {
					VolumeSliderView(
						viewModel: viewModel,
						controller: viewModel.volumeController
					)
					.transition(.opacity)
				}
			}
			.padding(.horizontal, 20)

			// Skip pill / countdown card live outside controlsVisible so they
			// stay actionable while the chrome is hidden — but not while the
			// controls are locked (nothing tappable in lock mode; an armed
			// countdown still auto-advances, which suits hands-off viewing).
			if !viewModel.controlsLocked {
				VStack {
					Spacer()
					HStack {
						Spacer()
						if let countdown = viewModel.countdownRemaining, let next = viewModel.nextEpisode {
							NextEpisodeCountdownView(viewModel: viewModel, next: next, remaining: countdown)
						} else if let segment = viewModel.activeSegment {
							SkipSegmentButton(viewModel: viewModel, segment: segment)
						}
					}
				}
				.padding(.trailing, 24)
				// Clears the bottom bar, which grew a chapter label + ends-at line.
				.padding(.bottom, viewModel.controlsVisible ? 124 : 32)
			}

			// Hold-for-2× feedback pill; lives outside controlsVisible so it
			// shows over clean video too.
			if viewModel.isHoldSpeedActive {
				VStack {
					HStack(spacing: 5) {
						Text("2×")
							.font(.footnote.weight(.bold).monospacedDigit())
						Image(systemName: "forward.fill")
							.font(.system(size: 11, weight: .semibold))
					}
					.foregroundStyle(.white)
					.padding(.horizontal, 14)
					.padding(.vertical, 8)
					.background(.black.opacity(0.55), in: Capsule())
					Spacer()
				}
				.padding(.top, 24)
				.transition(.opacity)
				.allowsHitTesting(false)
			}

			// Lock mode: taps only toggle this transient unlock pill.
			if viewModel.controlsLocked && viewModel.unlockButtonRevealed {
				VStack {
					Button {
						viewModel.unlockControls()
					} label: {
						HStack(spacing: 6) {
							Image(systemName: "lock.open.fill")
								.font(.system(size: 13, weight: .semibold))
							Text(viewModel.str("unlock", "Unlock"))
								.font(.footnote.weight(.semibold))
						}
						.foregroundStyle(.white)
						.padding(.horizontal, 14)
						.padding(.vertical, 9)
						.background(.black.opacity(0.55), in: Capsule())
					}
					Spacer()
				}
				.padding(.top, 24)
				.transition(.opacity)
			}

			if viewModel.showTechnicalInfo {
				VStack {
					HStack {
						TechnicalInfoOverlay(viewModel: viewModel)
						Spacer()
					}
					Spacer()
				}
				.padding(.top, 56)
				.padding(.leading, 24)
			}

			if viewModel.showStillWatching {
				// Above the bars layer (zIndex 1); shown even in lock mode —
				// the video has ended and this is the only way forward.
				StillWatchingOverlay(viewModel: viewModel)
					.transition(.opacity)
					.zIndex(2)
			}

			if let message = viewModel.errorMessage {
				errorOverlay(message: message)
					.zIndex(3)
			}
		}
		// Any touch-down anywhere on the overlay (buttons included — the
		// gesture is simultaneous, so it never steals their taps) re-arms the
		// auto-hide so the chrome can't vanish mid-press.
		.simultaneousGesture(
			DragGesture(minimumDistance: 0)
				.onChanged { _ in viewModel.touchInteractionOccurred() }
		)
		.animation(.easeInOut(duration: 0.2), value: viewModel.showStillWatching)
		.animation(.easeInOut(duration: 0.2), value: viewModel.controlsVisible)
		.animation(.easeInOut(duration: 0.2), value: viewModel.activeSegment?.startSec)
		.animation(.easeInOut(duration: 0.2), value: viewModel.countdownRemaining != nil)
		.animation(.easeInOut(duration: 0.2), value: viewModel.volumeSliderRevealed)
		.animation(.easeInOut(duration: 0.2), value: viewModel.brightnessSliderRevealed)
		.animation(.easeInOut(duration: 0.2), value: viewModel.unlockButtonRevealed)
		.animation(.easeInOut(duration: 0.15), value: viewModel.isHoldSpeedActive)
		// SwiftUI never delivers onEnded when the SYSTEM cancels the touch
		// (incoming call, Control Center edge swipe, backgrounding) — release
		// an engaged hold here or playback stays stuck at 2×.
		.onReceive(
			NotificationCenter.default.publisher(
				for: UIApplication.willResignActiveNotification
			)
		) { _ in
			viewModel.endHoldSpeed()
		}
		.sheet(isPresented: $viewModel.showEpisodeList) {
			EpisodeListView(viewModel: viewModel)
		}
		.sheet(isPresented: $viewModel.showSubtitleSearch) {
			SubtitleSearchView(viewModel: viewModel)
		}
	}

	// MARK: - Surface gestures

	/// Press-and-hold anywhere on empty video = 2× until release. The long
	/// press alone ends the moment its duration elapses, so it sequences into
	/// a zero-distance drag that keeps the composite alive until the finger
	/// lifts — onEnded is the release. beginHoldSpeed re-entry-guards itself,
	/// so the repeated onChanged ticks during the drag phase are harmless.
	private var holdSpeedGesture: some Gesture {
		LongPressGesture(minimumDuration: 0.5)
			.sequenced(before: DragGesture(minimumDistance: 0))
			.onChanged { value in
				if case .second = value {
					viewModel.beginHoldSpeed()
				}
			}
			.onEnded { _ in
				viewModel.endHoldSpeed()
			}
	}

	/// Horizontal drag anywhere = scrub (Apple TV app style, through the same
	/// beginScrub/updateScrub/endScrub path as the scrubber, so trickplay,
	/// chapter haptics and pause-while-scrubbing come along). Vertical drag =
	/// brightness on the left half, volume on the right (JS GestureOverlay
	/// parity), with the edge pills transiently revealed as feedback.
	private func surfaceDragGesture(size: CGSize) -> some Gesture {
		DragGesture(minimumDistance: 12)
			.onChanged { value in
				guard !viewModel.controlsLocked,
					!viewModel.showStillWatching,
					viewModel.errorMessage == nil
				else { return }

				// A two-finger pinch or an engaged 2× hold owns this touch
				// sequence — abandon any in-flight drag and ignore the rest of
				// the sequence. Resuming later would apply the accumulated
				// translation (finger spread / hold drift) against a stale
				// baseline and make volume/brightness or the scrubber jump.
				if viewModel.isPinching || viewModel.isHoldSpeedActive || dragSuppressed {
					if !dragSuppressed {
						dragSuppressed = true
						if dragAxis == .vertical {
							if dragOnLeftHalf {
								viewModel.brightnessController.isUserInteracting = false
							} else {
								viewModel.volumeController.isUserInteracting = false
							}
						}
						dragAxis = nil
					}
					return
				}

				if dragAxis == nil {
					if abs(value.translation.width) >= abs(value.translation.height) {
						dragAxis = .horizontal
						if viewModel.duration > 0 {
							viewModel.showControls()
							viewModel.beginScrub()
							dragStartFraction = viewModel.scrubPosition / viewModel.duration
						}
					} else {
						dragAxis = .vertical
						dragOnLeftHalf = value.startLocation.x < size.width / 2
						if dragOnLeftHalf {
							dragStartLevel = viewModel.brightnessController.brightness
							viewModel.brightnessController.isUserInteracting = true
						} else {
							dragStartLevel = viewModel.volumeController.volume
							viewModel.volumeController.isUserInteracting = true
						}
					}
				}

				switch dragAxis {
				case .horizontal:
					guard viewModel.isScrubbing, size.width > 0 else { return }
					viewModel.updateScrub(
						fraction: dragStartFraction + value.translation.width / size.width
					)
				case .vertical:
					let level = dragStartLevel - value.translation.height / verticalDragRange
					if dragOnLeftHalf {
						viewModel.brightnessController.setBrightness(level)
						viewModel.revealBrightnessSliderTransiently()
					} else {
						viewModel.volumeController.setVolume(level)
						viewModel.revealVolumeSliderTransiently()
					}
				case nil:
					break
				}
			}
			.onEnded { _ in
				dragSuppressed = false
				if dragAxis == .horizontal, viewModel.isScrubbing {
					viewModel.endScrub()
				}
				if dragAxis == .vertical {
					if dragOnLeftHalf {
						viewModel.brightnessController.isUserInteracting = false
					} else {
						viewModel.volumeController.isUserInteracting = false
					}
				}
				dragAxis = nil
			}
	}

	private var scrims: some View {
		VStack(spacing: 0) {
			LinearGradient(
				colors: [Color.black.opacity(0.6), Color.black.opacity(0)],
				startPoint: .top, endPoint: .bottom
			)
			.frame(height: 140)
			Spacer()
			LinearGradient(
				colors: [Color.black.opacity(0), Color.black.opacity(0.6)],
				startPoint: .top, endPoint: .bottom
			)
			.frame(height: 160)
		}
		.ignoresSafeArea()
		.allowsHitTesting(false)
	}

	private func controls(compact: Bool) -> some View {
		VStack(spacing: 0) {
			PlayerTopBar(viewModel: viewModel, compact: compact)
			Spacer()
			PlayerBottomBar(viewModel: viewModel, time: viewModel.time)
		}
		.padding(.horizontal, 24)
		.padding(.vertical, 8)
	}

	private func errorOverlay(message: String) -> some View {
		VStack(spacing: 16) {
			Image(systemName: "exclamationmark.triangle.fill")
				.font(.system(size: 40))
				.foregroundStyle(.yellow)
			Text(viewModel.str("playbackError", "Playback error"))
				.font(.headline)
				.foregroundStyle(.white)
			Text(message)
				.font(.footnote)
				.foregroundStyle(.white.opacity(0.8))
				.multilineTextAlignment(.center)
				.lineLimit(4)
			Button {
				viewModel.dismissError()
			} label: {
				Text(viewModel.str("close", "Close"))
					.font(.headline)
					.padding(.horizontal, 28)
					.padding(.vertical, 10)
					.background(.white.opacity(0.2), in: Capsule())
					.foregroundStyle(.white)
			}
		}
		.padding(32)
		.frame(maxWidth: 420)
		.background(.black.opacity(0.85), in: RoundedRectangle(cornerRadius: 20))
	}
}

/// Bottom bar: current chapter name, the custom scrubber, then time labels
/// with the wall-clock finish time under the remaining time (JS TimeDisplay).
struct PlayerBottomBar: View {
	@ObservedObject var viewModel: PlayerViewModel
	/// The fast clock — time labels and the chapter caption tick off this.
	@ObservedObject var time: PlaybackTimeModel

	private static let endsAtFormatter: DateFormatter = {
		let formatter = DateFormatter()
		// The JS player renders hour12:false 2-digit — a fixed 24h format.
		formatter.dateFormat = "HH:mm"
		return formatter
	}()

	var body: some View {
		let position = viewModel.isScrubbing ? viewModel.scrubPosition : time.displayPosition
		let remaining = max(0, viewModel.duration - position)

		VStack(alignment: .leading, spacing: 6) {
			if let chapterName = viewModel.currentChapterName {
				Text(chapterName)
					.font(.caption)
					.foregroundStyle(.white.opacity(0.7))
					.lineLimit(1)
			}
			ScrubberView(viewModel: viewModel, time: time)
			HStack(alignment: .top) {
				Text(formatTime(position))
				Spacer()
				VStack(alignment: .trailing, spacing: 1) {
					Text("-" + formatTime(remaining))
					if viewModel.duration > 0 {
						Text(endsAtLabel(remaining: remaining))
							.font(.system(size: 10).monospacedDigit())
							.foregroundStyle(.white.opacity(0.55))
					}
					if viewModel.sleepTimerMinutes != nil, let end = viewModel.sleepTimerEndDate {
						// TimelineView ticks the label on its own — the
						// countdown must keep moving while paused, when the
						// display-link clock driving this bar is frozen.
						TimelineView(.periodic(from: .now, by: 1)) { context in
							HStack(spacing: 3) {
								Image(systemName: "moon.zzz.fill")
									.font(.system(size: 9))
								Text(formatTime(max(0, end.timeIntervalSince(context.date))))
									.font(.system(size: 10).monospacedDigit())
							}
							.foregroundStyle(.white.opacity(0.55))
						}
					}
				}
			}
			.font(.footnote.monospacedDigit())
			.foregroundStyle(.white.opacity(0.85))
		}
		.padding(.bottom, 8)
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

/// "H:MM:SS" over an hour, "M:SS" under.
func formatTime(_ seconds: Double) -> String {
	guard seconds.isFinite, seconds >= 0 else { return "0:00" }
	let total = Int(seconds.rounded())
	let hours = total / 3600
	let minutes = (total % 3600) / 60
	let secs = total % 60
	if hours > 0 {
		return String(format: "%d:%02d:%02d", hours, minutes, secs)
	}
	return String(format: "%d:%02d", minutes, secs)
}
#endif
