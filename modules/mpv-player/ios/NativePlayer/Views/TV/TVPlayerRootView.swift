#if os(tvOS)
import SwiftUI

/// tvOS root overlay. Phase 2: show/hide chrome with a bottom transport bar
/// (progress + times + ends-at) and a top-left metadata header. Nothing here
/// is focusable — all transport input arrives through the hosting view
/// controller's press recognizers, so Menu reliably reaches the VC. SwiftUI
/// focus enters only with the panels/shelves of later phases.
struct TVPlayerRootView: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		ZStack {
			if viewModel.controlsVisible {
				scrims
				VStack {
					TVMetadataHeader(viewModel: viewModel)
					Spacer()
					TVTransportBar(viewModel: viewModel, time: viewModel.time)
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

			if let message = viewModel.errorMessage {
				errorOverlay(message: message)
			}
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity)
		.animation(.easeInOut(duration: 0.2), value: viewModel.controlsVisible)
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

/// Bottom transport bar: play-state glyph, progress (played + buffered),
/// position, remaining and the wall-clock finish time. Observes
/// PlaybackTimeModel directly — PlayerViewModel deliberately does not
/// publish the ~30Hz clock (see PlaybackTimeModel).
private struct TVTransportBar: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ObservedObject var time: PlaybackTimeModel

	private static let endsAtFormatter: DateFormatter = {
		let formatter = DateFormatter()
		// The JS player renders hour12:false 2-digit — a fixed 24h format.
		formatter.dateFormat = "HH:mm"
		return formatter
	}()

	var body: some View {
		let position = time.displayPosition
		let duration = viewModel.duration
		let remaining = max(0, duration - position)

		VStack(alignment: .leading, spacing: 12) {
			if let chapterName = viewModel.currentChapterName {
				Text(chapterName)
					.font(.caption)
					.foregroundStyle(.white.opacity(0.7))
					.lineLimit(1)
			}

			HStack(spacing: 20) {
				Image(systemName: viewModel.isPlaying ? "play.fill" : "pause.fill")
					.font(.system(size: 24, weight: .semibold))
					.foregroundStyle(.white)

				progressBar(position: position, duration: duration)
					.frame(height: 10)
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
	}

	private func progressBar(position: Double, duration: Double) -> some View {
		GeometryReader { geometry in
			let width = geometry.size.width
			let playedFraction = duration > 0 ? min(max(position / duration, 0), 1) : 0
			let bufferedFraction =
				duration > 0
				? min(max((position + time.cacheSeconds) / duration, 0), 1) : 0

			ZStack(alignment: .leading) {
				Capsule().fill(.white.opacity(0.25))
				Capsule()
					.fill(.white.opacity(0.35))
					.frame(width: width * bufferedFraction)
				Capsule()
					.fill(.white)
					.frame(width: width * playedFraction)
			}
		}
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
