#if os(tvOS)
import SwiftUI

/// Full-screen remote subtitle search — the TV counterpart of the iOS
/// SubtitleSearchView sheet. Opens from the subtitles menu; the chrome hides
/// first so the panel's buttons are the only focusable content while the VC
/// recognizers stand down (focus mode). Results are display models pushed by
/// JS (updateSubtitleSearch); selecting one emits onSubtitleDownloadRequested
/// — search/download/refresh logic stays in JS. A successful apply closes the
/// panel from the JS side, straight back to the video.
@available(tvOS 26.0, *)
struct TVSubtitleSearchPanel: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		ZStack {
			// Unlike the shelf, this is a modal moment: dim the video fully so
			// the panel reads as the only interactive surface.
			Color.black.opacity(0.6).ignoresSafeArea()
			VStack(spacing: 28) {
				header
				content
					.frame(maxWidth: .infinity, maxHeight: .infinity)
			}
			.padding(44)
			.frame(width: 1100, height: 800)
			.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 24))
		}
		// Backup for the VC's always-live Menu recognizer (same pattern as
		// the episode shelf) — whichever fires, closing twice is harmless.
		.onExitCommand { viewModel.closeSubtitleSearch() }
	}

	private var header: some View {
		HStack {
			Text(viewModel.str("searchSubtitles", "Search subtitles"))
				.font(.title3.weight(.semibold))
				.foregroundStyle(.white)
			Spacer()
			languageMenu
		}
	}

	@ViewBuilder
	private var content: some View {
		switch viewModel.subtitleSearchStatus {
		case "searching":
			ProgressView()
				.progressViewStyle(.circular)
				.tint(.white)
				.scaleEffect(1.4)
		case "error":
			VStack(spacing: 16) {
				Image(systemName: "exclamationmark.triangle")
					.font(.system(size: 48))
					.foregroundStyle(.white.opacity(0.6))
				Text(viewModel.str("searchFailed", "Search failed"))
					.font(.headline)
					.foregroundStyle(.white)
				if let message = viewModel.subtitleSearchError {
					Text(message)
						.font(.callout)
						.foregroundStyle(.white.opacity(0.7))
						.multilineTextAlignment(.center)
						.lineLimit(4)
						.frame(maxWidth: 800)
				}
			}
		default:
			if viewModel.subtitleSearchResults.isEmpty {
				VStack(spacing: 16) {
					Image(systemName: "captions.bubble")
						.font(.system(size: 48))
						.foregroundStyle(.white.opacity(0.6))
					Text(viewModel.str("noSubtitlesFound", "No subtitles found"))
						.font(.headline)
						.foregroundStyle(.white)
				}
			} else {
				resultsList
			}
		}
	}

	private var resultsList: some View {
		VStack(spacing: 12) {
			// Inline failure banner (e.g. a download that errored) — the
			// result list stays usable underneath, unlike the full-screen
			// search-error state.
			if let message = viewModel.subtitleSearchError {
				Text(message)
					.font(.callout)
					.foregroundStyle(.orange)
					.frame(maxWidth: .infinity, alignment: .leading)
					.padding(.horizontal, 12)
			}
			ScrollView {
				LazyVStack(spacing: 14) {
					ForEach(
						Array(viewModel.subtitleSearchResults.enumerated()), id: \.offset
					) { _, result in
						resultRow(result)
					}
				}
				// Headroom for the focus scale so rows don't clip at the
				// scroll edges.
				.padding(.vertical, 16)
				.padding(.horizontal, 8)
			}
		}
	}

	private func resultRow(_ result: SubtitleSearchResultRecord) -> some View {
		Button {
			viewModel.downloadSubtitleResult(result)
		} label: {
			HStack(spacing: 20) {
				VStack(alignment: .leading, spacing: 6) {
					Text(result.name)
						.font(.system(size: 26, weight: .medium))
						.lineLimit(2)
						.multilineTextAlignment(.leading)
					HStack(spacing: 14) {
						Text(result.providerName)
							.font(.system(size: 20, weight: .semibold))
							.padding(.horizontal, 8)
							.padding(.vertical, 2)
							.background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 5))
						if let format = result.format, !format.isEmpty {
							Text(format.uppercased())
						}
						if let count = result.downloadCount {
							Label(count.formatted(), systemImage: "arrow.down.circle")
						}
						if let rating = result.communityRating, rating > 0 {
							Label(String(format: "%.1f", rating), systemImage: "star.fill")
						}
						if result.hearingImpaired {
							Image(systemName: "ear")
						}
						if result.aiTranslated {
							Text("AI")
								.font(.system(size: 20, weight: .bold))
						}
					}
					.font(.system(size: 20))
					.opacity(0.7)
				}
				Spacer()
				if viewModel.downloadingResultId == result.id {
					ProgressView()
				} else if result.isHashMatch {
					// Exact file-hash match — the closest thing to a
					// guaranteed sync.
					Image(systemName: "checkmark.seal")
						.opacity(0.7)
				}
			}
			.frame(maxWidth: .infinity, alignment: .leading)
			.padding(.vertical, 6)
		}
		.buttonStyle(.glass)
		// Rows stay visible but inert while one download is in flight.
		.disabled(viewModel.downloadingResultId != nil)
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
			HStack(spacing: 10) {
				Image(systemName: "globe")
				Text(currentLanguageName)
			}
			.font(.system(size: 24, weight: .semibold))
			.frame(height: 40)
		}
		.menuOrder(.fixed)
		.buttonStyle(.glass)
	}

	private var currentLanguageName: String {
		viewModel.subtitleSearchLanguages
			.first { $0.code == viewModel.subtitleSearchLanguage }?
			.name ?? viewModel.subtitleSearchLanguage.uppercased()
	}
}
#endif
