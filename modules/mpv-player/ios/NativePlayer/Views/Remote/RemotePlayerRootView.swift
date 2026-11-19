#if os(iOS)
import SwiftUI

/// The remote player's screen. Its layout follows the window's size class (RemoteLayout): upright, the six slots
/// stand top to bottom; couched, the titles and menus share a bar across the top, the artwork sits left of the
/// transport and the bar runs along the bottom; wide, the upright column stands beside the artwork. Where each slot
/// goes is RemoteArrangement's; the artwork's size is RemoteMetrics', so it shrinks before anything is cut.
struct RemotePlayerRootView: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ObservedObject var screen: RemoteScreenState
	@Environment(\.dynamicTypeSize) private var dynamicTypeSize

	private static let slotGap: CGFloat = 16
	private static let padding = CGFloat(PlayerConstants.remoteHorizontalPadding)

	/// What the TV does; read in the body, the screen follows each snapshot, the next episode and the engine's error.
	private var model: RemoteScreenModel { screen.model }

	/// The TV button's text: the TV's name, or that the session is coming back.
	private var targetName: String? {
		switch model.targetLabel {
		case let .name(name): return name
		case .reconnecting: return viewModel.str("reconnecting", "Reconnecting")
		}
	}

	var body: some View {
		GeometryReader { proxy in
			let width = Double(proxy.size.width)
			let height = Double(proxy.size.height)
			let layout = RemoteLayout.of(width: width, height: height)
			let artwork = CGFloat(RemoteMetrics.artworkHeight(layout: layout, width: width, height: height, fontScale: fontScale))
			let arrangement = RemoteArrangement.of(layout)

			VStack(spacing: 0) {
				if !arrangement.topBar.isEmpty {
					RemoteTopBar(viewModel: viewModel, targetName: targetName, tracksEnabled: model.trackMenusEnabled)
				}

				HStack(spacing: 0) {
					if let beside = arrangement.beside {
						Group {
							if let besideWidth = RemoteMetrics.besideWidth(layout: layout, width: width) {
								slot(beside, layout: layout, artwork: artwork)
									.frame(width: CGFloat(besideWidth))
							} else {
								slot(beside, layout: layout, artwork: artwork)
									.padding(.trailing, Self.padding)
							}
						}
					}
					// The column fills the height it is given, so its free height lands where `spaces` says; taller
					// than the screen, the spacers shrink to nothing and the column scrolls.
					GeometryReader { viewport in
						ScrollView {
							VStack(alignment: .leading, spacing: Self.slotGap) {
								ForEach(Array(arrangement.column.enumerated()), id: \.element) { index, item in
									spaced(index, of: arrangement) { slot(item, layout: layout, artwork: artwork) }
								}
							}
							.frame(maxWidth: .infinity, minHeight: viewport.size.height, alignment: .top)
						}
						.scrollBounceBehavior(.basedOnSize)
					}
					.frame(maxHeight: .infinity)
				}
				.frame(maxHeight: .infinity)

				ForEach(arrangement.bottom, id: \.self) { slot($0, layout: layout, artwork: artwork) }
			}
			.padding(.horizontal, Self.padding)
		}
		// Tone 20 at the top to tone 10 at remoteTintGradientEnd, flat below; a new tint fades in.
		.background(
			LinearGradient(
				stops: [
					.init(color: remoteColor(screen.colors.top), location: 0),
					.init(color: remoteColor(screen.colors.bottom), location: PlayerConstants.remoteTintGradientEnd),
				],
				startPoint: .top,
				endPoint: .bottom
			)
			.ignoresSafeArea()
			.animation(.easeInOut(duration: PlayerConstants.remoteTintFadeMs / 1000), value: screen.colors)
		)
		.environment(\.remoteAccent, remoteColor(screen.colors.accent))
		.animation(.easeInOut(duration: PlayerConstants.remoteTintFadeMs / 1000), value: screen.colors.accent)
		.sheet(isPresented: $viewModel.showEpisodeList) {
			EpisodeListView(viewModel: viewModel)
		}
	}

	/// One slot, alone in its place: the column, the side or the bottom band. The top bar draws its own three.
	@ViewBuilder
	private func slot(_ slot: RemoteSlot, layout: RemoteLayout, artwork: CGFloat) -> some View {
		switch slot {
		case .header:
			RemoteHeader(viewModel: viewModel)
		case .artwork:
			// The artwork's double tap seeks like the bar, so it rests when the bar does.
			RemoteArtwork(viewModel: viewModel, size: artwork)
				.overlay { if model.seekEnabled { artworkTaps } }
				.frame(maxWidth: layout == .portrait ? .infinity : nil)
		case .titles:
			RemoteTitles(viewModel: viewModel, compact: false)
				.frame(maxWidth: .infinity, alignment: .leading)
		case .bar:
			VStack(alignment: .leading, spacing: 8) {
				// A failure is said above the bar, whatever the TV does, with Play here when it offers it.
				if let failure = model.failure {
					Text(failure)
						.font(.subheadline)
						.foregroundStyle(.white)
					if model.canPlayHere {
						RemotePillButton(label: viewModel.str("playHere", "Play here"), action: screen.playHere)
					}
				}
				// The list the TV got is over and the phone knows what comes after it: offered, never counted down.
				if model.nextUpVisible, let next = viewModel.nextEpisode {
					RemoteNextUpCard(viewModel: viewModel, next: next, onContinue: screen.continueNextUp)
				}
				RemoteBar(viewModel: viewModel)
					.remoteInert(!model.seekEnabled)
			}
		case .transport:
			RemoteTransportRow(viewModel: viewModel, layout: layout, spinner: model.playShowsSpinner)
				.remoteInert(!model.transportEnabled)
				.frame(maxWidth: .infinity)
		case .bottomRow:
			RemoteBottomRow(viewModel: viewModel, targetName: targetName, tracksEnabled: model.trackMenusEnabled)
		}
	}

	/// A double tap on a half of the artwork seeks back or forward, with the chrome's pill on that half. The layer runs
	/// left to right in every language, so the tap's x is from the physical left edge (RemoteGestures.artworkTapSeek).
	private var artworkTaps: some View {
		GeometryReader { box in
			ZStack {
				Color.clear
					.contentShape(Rectangle())
					.gesture(SpatialTapGesture(count: 2).onEnded { tap in
						let fraction = Double(tap.location.x / max(box.size.width, 1))
						viewModel.seekWithPill(forward: RemoteGestures.artworkTapSeek(xFraction: fraction) > 0)
					})
				if let forward = viewModel.doubleTapSeekForward {
					HStack {
						if forward { Spacer() }
						DoubleTapSeekPill(
							forward: forward,
							seconds: forward ? viewModel.seekForwardSec : viewModel.seekBackwardSec
						)
						if !forward { Spacer() }
					}
					.id(forward)
					.transition(.opacity)
					.allowsHitTesting(false)
				}
			}
			.environment(\.layoutDirection, .leftToRight)
		}
		.animation(.easeInOut(duration: 0.15), value: viewModel.doubleTapSeekForward)
	}

	/// A column slot with the free height `spaces` gives it: above it, and below it when it is the last. Nested, so
	/// the column's own gap is not added around the spacers.
	private func spaced<Content: View>(_ index: Int, of arrangement: RemoteArrangement, @ViewBuilder _ content: () -> Content) -> some View {
		VStack(alignment: .leading, spacing: 0) {
			if arrangement.spaces.contains(index) { Spacer(minLength: 0) }
			content()
			if index == arrangement.column.count - 1 && arrangement.spaces.contains(arrangement.column.count) {
				Spacer(minLength: 0)
			}
		}
	}

	/// The text's scale against the default size, as RemoteMetrics counts it: the body style at this Dynamic Type
	/// size over the body style at the default one.
	private var fontScale: Double {
		let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(dynamicTypeSize))
		return Double(UIFontMetrics(forTextStyle: .body).scaledValue(for: 100, compatibleWith: traits) / 100)
	}
}
/// The next episode, at the end of the list the TV got: its image (asked for with the user's proxy headers), the
/// label, its titles, and Continue, which sends it. No countdown: the TV waits as long as the phone does.
private struct RemoteNextUpCard: View {
	@ObservedObject var viewModel: PlayerViewModel
	let next: NextEpisodeRecord
	let onContinue: () -> Void
	// Dynamic Type: each size grows with the text style it stands for, as Android's sp do.
	@ScaledMetric(relativeTo: .caption) private var labelSize: CGFloat = 12
	@ScaledMetric(relativeTo: .subheadline) private var titleSize: CGFloat = 15
	@ScaledMetric(relativeTo: .footnote) private var subtitleSize: CGFloat = 13

	var body: some View {
		VStack(alignment: .leading, spacing: 8) {
			HStack(spacing: 12) {
				ZStack {
					if let uri = next.imageUrl, let url = URL(string: uri) {
						RemoteImage(url: url, headers: RemoteImageHeaders.of(own: nil, server: viewModel.imageHeaders)) {
							Color.white.opacity(0.08)
						}
						.scaledToFill()
					}
				}
				.frame(
					width: PlayerConstants.remoteNextUpImageWidth,
					height: PlayerConstants.remoteNextUpImageWidth * 9 / 16
				)
				.background(Color.white.opacity(0.08))
				.clipShape(RoundedRectangle(cornerRadius: 6))
				.accessibilityHidden(true)
				// Read as one by VoiceOver: "Next Episode", then the episode.
				VStack(alignment: .leading, spacing: 2) {
					Text(viewModel.str("nextEpisode", "Next Episode"))
						.font(.system(size: labelSize))
						.foregroundStyle(.white.opacity(0.7))
					Text(next.title)
						.font(.system(size: titleSize, weight: .semibold))
						.foregroundStyle(.white)
						.lineLimit(2)
					if let subtitle = next.subtitle {
						Text(subtitle)
							.font(.system(size: subtitleSize))
							.foregroundStyle(.white.opacity(0.7))
							.lineLimit(2)
					}
				}
				.accessibilityElement(children: .combine)
				.frame(maxWidth: .infinity, alignment: .leading)
			}
			RemotePillButton(label: viewModel.str("continueWatching", "Continue Watching"), action: onContinue)
		}
		.padding(.bottom, 4)
	}
}

/// A pill under a message: Play here under a failure, Continue under the next episode.
private struct RemotePillButton: View {
	let label: String
	let action: () -> Void

	var body: some View {
		Button(action: action) {
			Text(label)
				.font(.subheadline.weight(.semibold))
				.foregroundStyle(.white)
				.padding(.horizontal, 16)
				.frame(minHeight: PlayerConstants.remoteButtonSmall)
				.background(
					Capsule().fill(Color.white.opacity(PlayerConstants.remotePlayHereFillOpacity))
				)
		}
		.buttonStyle(.plain)
	}
}
#endif
