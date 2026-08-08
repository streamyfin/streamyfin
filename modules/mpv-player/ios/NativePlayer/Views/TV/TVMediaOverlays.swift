#if os(tvOS)
import SwiftUI

/// Skip intro/credits pill — non-focusable on purpose: with the chrome
/// hidden, Select or Play/Pause triggers the skip via the VC recognizers
/// (TV users expect a button press, not focus-hunting).
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
		.background(.black.opacity(0.7), in: Capsule())
		.overlay(Capsule().stroke(.white.opacity(0.3), lineWidth: 1))
	}
}

/// Next-episode countdown card. Select / Play-Pause = play now (VC
/// recognizers), Menu = cancel. Mirrors NextEpisodeCountdownView content.
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
		.background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 18))
		.overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.25), lineWidth: 1))
	}
}

/// "Are you still watching?" — focusable card (the VC hands the remote to
/// SwiftUI focus while it is up). Same actions as the iOS overlay.
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
		.background(.black.opacity(0.88), in: RoundedRectangle(cornerRadius: 24))
	}
}

/// Horizontal episode shelf (bottom third). Focusable cards; Select fires
/// the existing onEpisodeSelected intent via viewModel.selectEpisode.
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
			LinearGradient(
				colors: [Color.black.opacity(0), Color.black.opacity(0.9)],
				startPoint: .top, endPoint: .bottom
			)
			.ignoresSafeArea(edges: .bottom)
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
		.buttonStyle(.card)
	}
}
#endif
