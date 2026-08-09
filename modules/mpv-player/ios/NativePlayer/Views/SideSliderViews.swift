#if os(iOS)
import SwiftUI

/// Vertical slider pill (volume / brightness), modeled on the JS player's
/// rotated edge sliders: capsule track filling from the bottom with an icon
/// underneath; drag anywhere on the pill to set the value.
struct VerticalSliderPill: View {
	let systemImage: String
	/// 0–1.
	let value: Double
	let onChanged: (Double) -> Void
	let onEditingChanged: (Bool) -> Void

	@State private var isDragging = false

	private static let trackHeight: CGFloat = 130
	private static let trackWidth: CGFloat = 6

	var body: some View {
		VStack(spacing: 10) {
			GeometryReader { geometry in
				let height = geometry.size.height
				ZStack(alignment: .bottom) {
					Capsule()
						.fill(.white.opacity(0.3))
					Capsule()
						.fill(.white)
						.frame(height: max(Self.trackWidth, height * value))
				}
				.frame(width: Self.trackWidth)
				.frame(maxWidth: .infinity)
			}
			.frame(width: 34, height: Self.trackHeight)
			.contentShape(Rectangle())
			.gesture(
				DragGesture(minimumDistance: 0)
					.onChanged { drag in
						if !isDragging {
							isDragging = true
							onEditingChanged(true)
						}
						let fraction = 1 - drag.location.y / Self.trackHeight
						onChanged(min(max(fraction, 0), 1))
					}
					.onEnded { _ in
						isDragging = false
						onEditingChanged(false)
					}
			)

			Image(systemName: systemImage)
				.font(.system(size: 14, weight: .semibold))
				.foregroundStyle(.white)
		}
	}
}

/// System volume. Also shown transiently (without the rest of the chrome) on
/// hardware volume presses — the hidden MPVolumeView suppresses the system
/// HUD, so this pill is the only visible feedback.
struct VolumeSliderView: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ObservedObject var controller: SystemVolumeController

	var body: some View {
		VerticalSliderPill(
			systemImage: volumeSymbol,
			value: controller.volume,
			onChanged: { newValue in
				controller.setVolume(newValue)
				viewModel.revealVolumeSliderTransiently()
			},
			onEditingChanged: { editing in
				controller.isUserInteracting = editing
				if editing {
					viewModel.menuInteractionStarted()
				} else {
					viewModel.scheduleAutoHide()
				}
			}
		)
	}

	private var volumeSymbol: String {
		if controller.volume <= 0.001 { return "speaker.slash.fill" }
		return controller.volume < 0.5 ? "speaker.wave.1.fill" : "speaker.wave.2.fill"
	}
}

/// Screen brightness, kept in sync with Control Center / auto-brightness via
/// the system notification.
struct BrightnessSliderView: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ObservedObject var controller: SystemBrightnessController

	var body: some View {
		VerticalSliderPill(
			systemImage: controller.brightness < 0.4 ? "sun.min.fill" : "sun.max.fill",
			value: controller.brightness,
			onChanged: { controller.setBrightness($0) },
			onEditingChanged: { editing in
				controller.isUserInteracting = editing
				if editing {
					viewModel.menuInteractionStarted()
				} else {
					viewModel.scheduleAutoHide()
				}
			}
		)
	}
}
#endif
