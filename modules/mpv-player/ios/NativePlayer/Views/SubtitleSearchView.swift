#if os(iOS)
import SwiftUI

/// In-player remote subtitle search, presented as a sheet. Results are
/// display models pushed down by JS (updateSubtitleSearch); tapping one emits
/// onSubtitleDownloadRequested — search/download/refresh logic stays in JS.
struct SubtitleSearchView: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		NavigationStack {
			content
				.navigationTitle(viewModel.str("searchSubtitles", "Search subtitles"))
				.navigationBarTitleDisplayMode(.inline)
				.toolbar {
					ToolbarItem(placement: .navigationBarLeading) {
						languageMenu
					}
					ToolbarItem(placement: .navigationBarTrailing) {
						Button {
							viewModel.showSubtitleSearch = false
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

	@ViewBuilder
	private var content: some View {
		switch viewModel.subtitleSearchStatus {
		case "searching":
			statusView {
				ProgressView()
					.controlSize(.large)
			}
		case "error":
			statusView {
				VStack(spacing: 10) {
					Image(systemName: "exclamationmark.triangle")
						.font(.system(size: 32))
						.foregroundStyle(.secondary)
					Text(viewModel.str("searchFailed", "Search failed"))
						.font(.headline)
					if let message = viewModel.subtitleSearchError {
						Text(message)
							.font(.footnote)
							.foregroundStyle(.secondary)
							.multilineTextAlignment(.center)
							.lineLimit(4)
					}
				}
				.padding(.horizontal, 32)
			}
		default:
			if viewModel.subtitleSearchResults.isEmpty {
				statusView {
					VStack(spacing: 10) {
						Image(systemName: "captions.bubble")
							.font(.system(size: 32))
							.foregroundStyle(.secondary)
						Text(viewModel.str("noSubtitlesFound", "No subtitles found"))
							.font(.headline)
					}
				}
			} else {
				resultsList
			}
		}
	}

	private func statusView<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
		VStack {
			Spacer()
			content()
			Spacer()
		}
		.frame(maxWidth: .infinity)
	}

	private var resultsList: some View {
		List(Array(viewModel.subtitleSearchResults.enumerated()), id: \.offset) { _, result in
			Button {
				viewModel.downloadSubtitleResult(result)
			} label: {
				row(for: result)
			}
			// Rows stay visible but inert while one download is in flight.
			.disabled(viewModel.downloadingResultId != nil)
			.listRowBackground(Color.clear)
		}
		.listStyle(.plain)
	}

	private func row(for result: SubtitleSearchResultRecord) -> some View {
		HStack(spacing: 12) {
			VStack(alignment: .leading, spacing: 4) {
				Text(result.name)
					.font(.subheadline)
					.foregroundStyle(.primary)
					.lineLimit(2)
				HStack(spacing: 10) {
					Text(result.providerName)
						.font(.caption2.weight(.semibold))
						.padding(.horizontal, 6)
						.padding(.vertical, 2)
						.background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 4))
					if let format = result.format, !format.isEmpty {
						Text(format.uppercased())
					}
					if let count = result.downloadCount {
						Label(count.formatted(), systemImage: "arrow.down.circle")
							.labelStyle(.titleAndIcon)
					}
					if let rating = result.communityRating, rating > 0 {
						Label(String(format: "%.1f", rating), systemImage: "star.fill")
					}
					if result.hearingImpaired {
						Image(systemName: "ear")
					}
					if result.aiTranslated {
						Text("AI")
							.font(.caption2.weight(.bold))
					}
				}
				.font(.caption)
				.foregroundStyle(.secondary)
			}
			Spacer()
			if viewModel.downloadingResultId == result.id {
				ProgressView()
			} else if result.isHashMatch {
				// Exact file-hash match — the closest thing to a guaranteed sync.
				Image(systemName: "checkmark.seal")
					.foregroundStyle(.secondary)
			}
		}
		.padding(.vertical, 4)
	}

	private var languageMenu: some View {
		Menu {
			ForEach(viewModel.subtitleSearchLanguages, id: \.code) { language in
				Button {
					viewModel.requestSubtitleSearch(language: language.code)
				} label: {
					if language.code == viewModel.subtitleSearchLanguage {
						Label(language.name, systemImage: "checkmark")
					} else {
						Text(language.name)
					}
				}
			}
		} label: {
			HStack(spacing: 4) {
				Image(systemName: "globe")
				Text(currentLanguageName)
			}
			.font(.subheadline)
		}
	}

	private var currentLanguageName: String {
		viewModel.subtitleSearchLanguages
			.first { $0.code == viewModel.subtitleSearchLanguage }?
			.name ?? viewModel.subtitleSearchLanguage.uppercased()
	}
}
#endif
