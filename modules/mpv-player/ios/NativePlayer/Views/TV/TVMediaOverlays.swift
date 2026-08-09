#if os(tvOS)
import SwiftUI

/// Skip intro/credits pill — non-focusable on purpose, and shown only while
/// the chrome is hidden: Select triggers the skip via the VC recognizers
/// (Play/Pause stays playback-only). In the full chrome the controls row
/// hosts a focusable Skip button instead.
@available(tvOS 26.0, *)
struct TVSkipPill: View {
	@ObservedObject var viewModel: PlayerViewModel
	let segment: MediaSegmentRecord

	var body: some View {
		Text(
			segment.type == "Intro"
				? viewModel.str("skipIntro", "Skip Intro")
				: viewModel.str("skipCredits", "Skip Credits")
		)
		.font(.callout.weight(.semibold))
		.foregroundStyle(.white)
		.padding(.horizontal, 28)
		.padding(.vertical, 14)
		// Liquid Glass, matching the .glass button style of the controls row —
		// a flat black capsule reads as a foreign tint next to the real material.
		.glassEffect(.regular, in: Capsule())
	}
}

/// Next-episode countdown card. Select / Play-Pause = play now (VC
/// recognizers), Menu = cancel. Mirrors NextEpisodeCountdownView content.
@available(tvOS 26.0, *)
struct TVCountdownCard: View {
	@ObservedObject var viewModel: PlayerViewModel
	let next: NextEpisodeRecord
	let remaining: Double

	var body: some View {
		HStack(spacing: 18) {
			if let imageUrl = next.imageUrl, let url = URL(string: imageUrl) {
				AsyncImage(url: url) { image in
					image.resizable().aspectRatio(contentMode: .fill)
				} placeholder: {
					Color.black.opacity(0.4)
				}
				.frame(width: 168, height: 94)
				.clipShape(RoundedRectangle(cornerRadius: 10))
			}
			VStack(alignment: .leading, spacing: 6) {
				Text("\(viewModel.str("nextEpisode", "Next episode")) · \(Int(remaining))s")
					.font(.caption)
					.foregroundStyle(.white.opacity(0.7))
				Text(next.title)
					.font(.callout.weight(.semibold))
					.foregroundStyle(.white)
					.lineLimit(1)
				if let subtitle = next.subtitle {
					Text(subtitle)
						.font(.caption)
						.foregroundStyle(.white.opacity(0.7))
						.lineLimit(1)
				}
			}
		}
		.padding(18)
		.frame(maxWidth: 620, alignment: .leading)
		.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 18))
	}
}

/// "Are you still watching?" — focusable card (the VC hands the remote to
/// SwiftUI focus while it is up). Same actions as the iOS overlay.
@available(tvOS 26.0, *)
struct TVStillWatchingCard: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		VStack(spacing: 28) {
			Text(viewModel.str("stillWatching", "Are you still watching?"))
				.font(.title3.weight(.semibold))
				.foregroundStyle(.white)
			HStack(spacing: 20) {
				Button(viewModel.str("continueWatching", "Continue watching")) {
					viewModel.continueWatchingTapped()
				}
				Button(viewModel.str("goBack", "Go back")) {
					viewModel.stillWatchingCloseTapped()
				}
			}
		}
		.padding(48)
		.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 24))
	}
}

/// Focus style for shelf cards: no platter, just scale + shadow on the
/// whole label (image and text together). Every built-in tvOS style draws
/// its own focus decor (.card/.plain add a platter around the label,
/// .borderless lifts only the image), so the bare look needs this.
@available(tvOS 26.0, *)
private struct TVShelfCardButtonStyle: ButtonStyle {
	@Environment(\.isFocused) private var isFocused

	func makeBody(configuration: Configuration) -> some View {
		configuration.label
			.scaleEffect(isFocused ? 1.1 : 1.0)
			.shadow(color: .black.opacity(isFocused ? 0.5 : 0), radius: 18, y: 10)
			.animation(.easeOut(duration: 0.15), value: isFocused)
	}
}

/// Horizontal episode shelf (bottom third). Focusable cards; Select fires
/// the existing onEpisodeSelected intent via viewModel.selectEpisode.
@available(tvOS 26.0, *)
struct TVEpisodeShelf: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		VStack(alignment: .leading, spacing: 16) {
			Text(viewModel.str("episodes", "Episodes"))
				.font(.title3.weight(.semibold))
				.foregroundStyle(.white)
				.padding(.horizontal, 80)
			ScrollView(.horizontal, showsIndicators: false) {
				HStack(spacing: 28) {
					ForEach(Array(viewModel.episodeList.enumerated()), id: \.offset) { _, episode in
						episodeCard(episode)
					}
				}
				.padding(.horizontal, 80)
				.padding(.vertical, 30)
			}
		}
		.padding(.vertical, 30)
		.frame(maxWidth: .infinity, alignment: .leading)
		.background(
			// Darkness arrives early (75% black a third of the way down) so
			// the cards sit on solid ground; only the top edge stays a fade.
			LinearGradient(
				stops: [
					.init(color: .black.opacity(0), location: 0),
					.init(color: .black.opacity(0.75), location: 0.35),
					.init(color: .black.opacity(0.95), location: 1),
				],
				startPoint: .top, endPoint: .bottom
			)
			// Bleed past the tvOS overscan insets on every touched edge —
			// .bottom alone leaves ~90pt gaps at the left/right screen edges.
			.ignoresSafeArea()
		)
		.onExitCommand { viewModel.showEpisodeList = false }
	}

	private func episodeCard(_ episode: EpisodeListItemRecord) -> some View {
		Button {
			viewModel.selectEpisode(episode)
		} label: {
			VStack(alignment: .leading, spacing: 8) {
				ZStack(alignment: .bottomLeading) {
					if let imageUrl = episode.imageUrl, let url = URL(string: imageUrl) {
						AsyncImage(url: url) { image in
							image.resizable().aspectRatio(contentMode: .fill)
						} placeholder: {
							Color.white.opacity(0.1)
						}
					} else {
						Color.white.opacity(0.1)
					}
					if episode.progressPercent > 0 {
						GeometryReader { geometry in
							VStack {
								Spacer()
								Rectangle().fill(.white.opacity(0.3)).frame(height: 5)
									.overlay(alignment: .leading) {
										Rectangle().fill(.white)
											.frame(
												width: geometry.size.width
													* CGFloat(min(max(episode.progressPercent / 100, 0), 1)),
												height: 5)
									}
							}
						}
					}
				}
				.frame(width: 300, height: 168)
				.clipShape(RoundedRectangle(cornerRadius: 12))
				.overlay(
					RoundedRectangle(cornerRadius: 12)
						.stroke(episode.isCurrent ? .white : .clear, lineWidth: 3)
				)
				Text(
					episode.indexNumber.map { "\($0). \(episode.title)" } ?? episode.title
				)
				.font(.caption)
				.foregroundStyle(.white.opacity(0.9))
				.lineLimit(1)
				.frame(maxWidth: 300, alignment: .leading)
			}
		}
		.buttonStyle(TVShelfCardButtonStyle())
	}
}
#endif
