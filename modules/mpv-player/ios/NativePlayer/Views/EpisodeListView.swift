#if os(iOS)
import SwiftUI

/// In-player episode picker, presented as a sheet. Rows are display models
/// pushed down by JS (updateEpisodeList); tapping one emits onEpisodeSelected
/// and the JS coordinator swaps the stream in place.
struct EpisodeListView: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		NavigationStack {
			VStack(spacing: 0) {
				if viewModel.episodeSeasons.count > 1 {
					Picker(
						viewModel.str("season", "Season"),
						selection: $viewModel.selectedEpisodeSeasonKey
					) {
						ForEach(viewModel.episodeSeasons) { season in
							Text(season.name).tag(Optional(season.id))
						}
					}
					.pickerStyle(.menu)
					.tint(.white)
					.padding(.horizontal)
					.frame(maxWidth: .infinity, alignment: .leading)
				}
				ScrollViewReader { proxy in
					List(viewModel.visibleEpisodes, id: \.itemId) { episode in
						Button {
							viewModel.selectEpisode(episode)
						} label: {
							row(for: episode)
						}
						.listRowBackground(episode.isCurrent ? Color.white.opacity(0.1) : Color.clear)
						.id(episode.itemId)
					}
					.listStyle(.plain)
					.onAppear { scrollToEpisode(using: proxy) }
					.onChange(of: viewModel.selectedEpisodeSeasonKey) { _ in
						scrollToEpisode(using: proxy)
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

	private func scrollToEpisode(using proxy: ScrollViewProxy) {
		if let episode = viewModel.visibleEpisodes.first(where: { $0.isCurrent })
			?? viewModel.visibleEpisodes.first {
			proxy.scrollTo(episode.itemId, anchor: episode.isCurrent ? .center : .top)
		}
	}

	private func row(for episode: EpisodeListItemRecord) -> some View {
		HStack(alignment: .top, spacing: 12) {
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

			VStack(alignment: .leading, spacing: 6) {
				Text(episode.details == nil ? episodeTitle(for: episode) : episode.title)
					.font(.subheadline.weight(episode.isCurrent ? .semibold : .regular))
					.foregroundStyle(.primary)
					.lineLimit(2)
				if let details = episode.details, !details.isEmpty {
					Text(details)
						.font(.caption)
						.foregroundStyle(.secondary)
						.fixedSize(horizontal: false, vertical: true)
				}
				if let overview = episode.overview, !overview.isEmpty {
					Text(overview)
						.font(.subheadline)
						.foregroundStyle(.secondary)
						.fixedSize(horizontal: false, vertical: true)
				}
				if episode.isCurrent {
					Image(systemName: "play.fill")
						.font(.caption2)
						.foregroundStyle(.secondary)
						.accessibilityLabel(viewModel.str("nowPlaying", "Now Playing"))
				}
			}
			.frame(maxWidth: .infinity, alignment: .leading)
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
