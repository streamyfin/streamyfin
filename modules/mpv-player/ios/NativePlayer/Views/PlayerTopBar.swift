#if os(iOS)
import SwiftUI

/// Top bar: close, title block, then PiP / episode list / speed / audio /
/// subtitle / more menus. Menu contents are display models pushed down by JS
/// (updateTrackMenus); taps emit intent events — selection logic stays in JS.
struct PlayerTopBar: View {
	@ObservedObject var viewModel: PlayerViewModel
	/// Narrow widths (portrait phones): the fixed button row would outgrow
	/// the screen once late data pushes add buttons (episode list), inflating
	/// the whole overlay — so zoom + speed fold into the More menu and the
	/// buttons tighten.
	var compact = false
	/// Narrower still (an iPhone SE or 13 mini in portrait): with the Cast button, the compact row outgrows the side
	/// padding, so picture in picture folds into More too.
	var foldsPictureInPicture = false

	/// The window width under which picture in picture folds into More: the compact row with every button, Cast
	/// included, needs about 332 pt, and a 375 pt screen leaves 327 inside the 24 pt side padding.
	static let pictureInPictureFoldWidth: CGFloat = 380

	private var buttonSize: CGFloat { compact ? 40 : 44 }

	var body: some View {
		HStack(spacing: 4) {
			barButton(systemName: "xmark") {
				viewModel.close()
			}
			.accessibilityLabel(viewModel.str("close", "Close"))

			VStack(alignment: .leading, spacing: 2) {
				if let title = viewModel.metadata?.title {
					Text(title)
						.font(.subheadline.weight(.semibold))
						.foregroundStyle(.white)
						.lineLimit(1)
				}
				if let subtitle = viewModel.metadata?.subtitle {
					Text(subtitle)
						.font(.caption)
						.foregroundStyle(.white.opacity(0.7))
						.lineLimit(1)
				}
				if let group = viewModel.syncPlay {
					Text("\(group.groupName) · \(group.connected ? group.status : viewModel.syncStr("reconnecting", "Reconnecting"))")
						.font(.caption).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
				}
			}
			.padding(.leading, 8)

			Spacer(minLength: 12)

			if viewModel.isSyncPlayActive {
				barButton(systemName: "person.2.fill") { viewModel.openSyncPlayQueue() }
					.accessibilityLabel(viewModel.syncStr("queue", "Queue"))
					.accessibilityIdentifier("syncplay-open-queue")
			}

			// Not in a SyncPlay group, which a later join can bring into a player that showed it.
			if viewModel.capabilities.cast && !viewModel.isSyncPlayActive {
				CastBarButton(viewModel: viewModel, size: buttonSize)
			}

			if viewModel.capabilities.pictureInPicture && !foldsPictureInPicture {
				barButton(systemName: viewModel.isPipActive ? "pip.exit" : "pip.enter") {
					viewModel.togglePictureInPicture()
				}
			}

			if !compact && viewModel.capabilities.zoom {
				barButton(
					systemName: viewModel.isZoomedToFill
						? "arrow.down.right.and.arrow.up.left"
						: "arrow.up.left.and.arrow.down.right"
				) {
					viewModel.toggleZoomToFill()
				}
			}

			if !viewModel.isSyncPlayActive && !viewModel.episodeList.isEmpty {
				barButton(systemName: "list.bullet") {
					viewModel.showEpisodeList = true
					viewModel.scheduleAutoHide()
				}
				.accessibilityLabel(viewModel.str("episodes", "Episodes"))
			}

			if !compact && !viewModel.isSyncPlayActive && viewModel.capabilities.speed {
				SpeedMenu(viewModel: viewModel) { barIcon(systemName: "speedometer") }
			}

			if !viewModel.audioMenu.isEmpty {
				AudioMenu(viewModel: viewModel) { barIcon(systemName: "waveform") }
			}

			if !viewModel.subtitleMenu.isEmpty {
				SubtitleMenu(viewModel: viewModel) { barIcon(systemName: "captions.bubble") }
			}

			MoreMenu(viewModel: viewModel, compact: compact, foldsPictureInPicture: foldsPictureInPicture) {
				barIcon(systemName: "ellipsis.circle")
			}
		}
	}

	// MARK: - Buttons

	private func barButton(systemName: String, action: @escaping () -> Void) -> some View {
		Button(action: action) {
			barIcon(systemName: systemName)
		}
	}

	private func barIcon(systemName: String) -> some View {
		Image(systemName: systemName)
			.font(.system(size: 17, weight: .semibold))
			.foregroundStyle(.white)
			.frame(width: buttonSize, height: buttonSize)
			.contentShape(Rectangle())
	}
}

/// Hands the video off to a receiver through the output sheet; the glyph says whether one is connected, and a ring
/// turns while one connects or reconnects. The sheet points at the button, from its frame in the window.
private struct CastBarButton: View {
	@ObservedObject var viewModel: PlayerViewModel
	let size: CGFloat
	@State private var frame: CGRect = .zero

	var body: some View {
		let connected = viewModel.castPhase == .connected
		Button {
			viewModel.openOutputSheet(anchor: frame)
		} label: {
			ZStack {
				CastGlyph(connected: connected)
					.fill(connected ? castConnectedTint : .white)
					.frame(width: 20, height: 20)
				if viewModel.castPhase == .connecting {
					ProgressView().tint(.white)
				}
			}
			.frame(width: size, height: size)
			.contentShape(Rectangle())
		}
		.background(
			GeometryReader { proxy in
				Color.clear
					.onAppear { frame = proxy.frame(in: .global) }
					.onChange(of: proxy.frame(in: .global)) { frame = $0 }
			}
		)
		.accessibilityLabel(viewModel.castButtonLabel)
		.accessibilityValue(viewModel.castButtonState)
	}
}
#endif
