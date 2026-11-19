#if os(iOS)
import SwiftUI

/// The remote player's screen, upright, in the order of the design (§3.1): the chevron that closes it, the
/// artwork, the titles, the bar with its times, the transport, the TV's name. Made of the local chrome's
/// pieces; the layouts for landscape and tablets, the tint and the slots come with the next PR.
struct RemotePlayerRootView: View {
	@ObservedObject var viewModel: PlayerViewModel
	let targetName: String?

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 0) {
				Button {
					viewModel.close()
				} label: {
					Image(systemName: "chevron.down")
						.font(.system(size: 22, weight: .semibold))
						.foregroundStyle(.white)
						.frame(width: 44, height: 44)
						.contentShape(Rectangle())
				}
				.accessibilityLabel(viewModel.str("close", "Close"))

				artwork
					.padding(.vertical, 16)

				Text(viewModel.metadata?.title ?? "")
					.font(.system(size: 22, weight: .bold))
					.foregroundStyle(.white)
					.lineLimit(2)
					.padding(.horizontal, 16)
				if let subtitle = viewModel.metadata?.subtitle {
					Text(subtitle)
						.font(.system(size: 15))
						.foregroundStyle(.white.opacity(0.7))
						.lineLimit(2)
						.padding(.horizontal, 16)
						.padding(.vertical, 4)
				}

				PlayerBottomBar(viewModel: viewModel, time: viewModel.time)
					.padding(.top, 16)

				PlayerCenterControls(viewModel: viewModel, time: viewModel.time)
					.frame(maxWidth: .infinity)
					.padding(.vertical, 16)

				if let targetName {
					HStack(spacing: 8) {
						CastGlyph(connected: true)
							.fill(.white)
							.frame(width: 18, height: 18)
							.accessibilityHidden(true)
						Text(targetName)
							.font(.system(size: 14))
							.foregroundStyle(.white)
							.lineLimit(1)
					}
					.padding(.horizontal, 16)
					.padding(.vertical, 8)
				}
			}
			.padding(.horizontal, 16)
			.padding(.vertical, 8)
		}
		.background(Color.black.ignoresSafeArea())
	}

	/// The artwork, whole, in a square as wide as the column.
	private var artwork: some View {
		Color.clear
			.aspectRatio(1, contentMode: .fit)
			.frame(maxWidth: .infinity)
			.overlay {
				if let uri = viewModel.metadata?.artworkUri, let url = URL(string: uri) {
					RemoteImage(url: url, headers: viewModel.metadata?.artworkHeaders) {
						Color.white.opacity(0.08)
					}
					.scaledToFit()
				}
			}
			.accessibilityHidden(true)
	}
}
#endif
