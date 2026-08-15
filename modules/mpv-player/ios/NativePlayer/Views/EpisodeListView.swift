#if os(iOS)
import SwiftUI

/// In-player episode picker, presented as a sheet. Rows are display models
/// pushed down by JS (updateEpisodeList); tapping one emits onEpisodeSelected
/// and the JS coordinator swaps the stream in place.
struct EpisodeListView: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		NavigationStack {
			ScrollViewReader { proxy in
				List(Array(viewModel.episodeList.enumerated()), id: \.element.itemId) { _, episode in
					Button {
						viewModel.selectEpisode(episode)
					} label: {
						row(for: episode)
					}
					.listRowBackground(episode.isCurrent ? Color.white.opacity(0.1) : Color.clear)
					.id(episode.itemId)
				}
				.listStyle(.plain)
				.onAppear {
					if let current = viewModel.episodeList.first(where: { $0.isCurrent }) {
						proxy.scrollTo(current.itemId, anchor: .center)
					}
				}
			}
			.navigationTitle(viewModel.str("episodes", "Episodes"))
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .navigationBarTrailing) {
					Button {
						viewModel.showEpisodeList = false
					} label: {
						Image(systemName: "xmark.circle.fill")
							.foregroundStyle(.secondary)
					}
				}
			}
		}
		.presentationDetents([.medium, .large])
		.preferredColorScheme(.dark)
	}

	private func row(for episode: EpisodeListItemRecord) -> some View {
		HStack(spacing: 12) {
			ZStack(alignment: .bottomLeading) {
				thumbnail(for: episode)
				if episode.progressPercent > 0 {
					GeometryReader { geometry in
						Rectangle()
							.fill(.white.opacity(0.9))
							.frame(width: geometry.size.width * episode.progressPercent / 100, height: 3)
							.frame(maxHeight: .infinity, alignment: .bottom)
					}
				}
			}
			.frame(width: 110, height: 62)
			.clipShape(RoundedRectangle(cornerRadius: 8))

			VStack(alignment: .leading, spacing: 3) {
				Text(episodeTitle(for: episode))
					.font(.subheadline.weight(episode.isCurrent ? .semibold : .regular))
					.foregroundStyle(.primary)
					.lineLimit(2)
				if episode.isCurrent {
					Image(systemName: "play.fill")
						.font(.caption2)
						.foregroundStyle(.secondary)
				}
			}
			Spacer()
		}
		.padding(.vertical, 4)
	}

	private func episodeTitle(for episode: EpisodeListItemRecord) -> String {
		if let index = episode.indexNumber {
			return "\(index). \(episode.title)"
		}
		return episode.title
	}

	@ViewBuilder
	private func thumbnail(for episode: EpisodeListItemRecord) -> some View {
		if let imageUrl = episode.imageUrl, let url = URL(string: imageUrl) {
			RemoteImage(url: url, headers: viewModel.imageHeaders) {
				Color.gray.opacity(0.3)
			}
		} else {
			Color.gray.opacity(0.3)
		}
	}
}
#endif
