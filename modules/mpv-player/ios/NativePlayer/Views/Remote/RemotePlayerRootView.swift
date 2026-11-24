#if os(iOS)
import SwiftUI

/// The remote player's screen. Its layout follows the window's size class (RemoteLayout): upright, the six slots
/// stand top to bottom; couched, the menus share a bar across the top, and the image fills the left half with the
/// titles, the bar and the transport in the right one; wide, the upright column stands beside the artwork. Where each
/// slot goes is RemoteArrangement's; the artwork's size is RemoteMetrics', so it shrinks before anything is cut.
struct RemotePlayerRootView: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ObservedObject var screen: RemoteScreenState
	@Environment(\.dynamicTypeSize) private var dynamicTypeSize
	/// Measured: the couched image takes the band under it, and its TV button grows with the text size.
	@State private var topBarHeight: Double?

	private static let slotGap: CGFloat = 16
	private static let padding = CGFloat(PlayerConstants.remoteHorizontalPadding)
	private static let gutter = CGFloat(PlayerConstants.remoteLandscapeGutter)
	private static let infoInset = CGFloat(PlayerConstants.remoteTechnicalInfoInset)

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
			let box = RemoteMetrics.artworkBox(
				layout: layout, width: width, height: height, fontScale: fontScale,
				aspectRatio: viewModel.metadata?.artworkAspectRatio, topBarHeight: topBarHeight
			)
			let artwork = CGSize(width: box.width, height: box.height)
			let beside = RemoteMetrics.besideWidth(layout: layout, width: width).map { CGFloat($0) }
			let arrangement = RemoteArrangement.of(layout)
			// The panel's room: couched the whole half, it centers on the image there; else the image.
			let infoWidth = (layout == .landscape ? beside ?? 0 : artwork.width) - 2 * Self.infoInset
			let slots = Slots(layout: layout, artwork: artwork, infoWidth: max(min(TechnicalInfoOverlay.compactMaxWidth, infoWidth), 0))

			VStack(spacing: 0) {
				if !arrangement.topBar.isEmpty {
					RemoteTopBar(viewModel: viewModel, targetName: targetName, model: model)
						.background {
							GeometryReader { bar in
								Color.clear.preference(key: RemoteTopBarHeightKey.self, value: bar.size.height)
							}
						}
				}

				HStack(spacing: 0) {
					if let slot = arrangement.beside {
						self.slot(slot, slots)
							.frame(width: beside)
							.frame(maxHeight: .infinity)
							.padding(.trailing, layout == .landscape ? Self.gutter : 0)
					}
					// The column fills the height it is given, so its free height lands where `spaces` says; taller
					// than the screen, the spacers shrink to nothing and the column scrolls. Couched, its slots are as
					// tall as the image and centered on it: the titles level with its top, the transport with its bottom.
					GeometryReader { viewport in
						let slotsHeight = layout == .landscape ? min(artwork.height, viewport.size.height) : viewport.size.height
						ScrollView {
							VStack(alignment: .leading, spacing: Self.slotGap) {
								ForEach(Array(arrangement.column.enumerated()), id: \.element) { index, item in
									spaced(index, of: arrangement) { slot(item, slots) }
								}
							}
							.frame(maxWidth: .infinity, minHeight: slotsHeight, alignment: .top)
							// Sized by its slots and slotsHeight alone, so the spacers share slotsHeight, never the viewport.
							.fixedSize(horizontal: false, vertical: true)
							.frame(maxWidth: .infinity, minHeight: viewport.size.height)
						}
						.scrollBounceBehavior(.basedOnSize)
					}
					.frame(maxHeight: .infinity)
				}
				.frame(maxHeight: .infinity)

				ForEach(arrangement.bottom, id: \.self) { slot($0, slots) }
			}
			.padding(.horizontal, Self.padding)
		}
		.onPreferenceChange(RemoteTopBarHeightKey.self) { topBarHeight = $0 > 0 ? Double($0) : nil }
		// Over the top bar, not in the stack: showing it moves nothing.
		.overlay(alignment: .top) { RemoteVolumeIndicatorView(indicator: screen.volumeIndicator) }
		// The technical info panel is drawn in the artwork's slot, which a rotation moves: asked for here, the lines JS
		// writes of what the TV plays survive it.
		.onAppear { if technicalInfoVisible { viewModel.technicalInfoShown(true) } }
		.onChange(of: technicalInfoVisible) { viewModel.technicalInfoShown($0) }
		.onDisappear { if technicalInfoVisible { viewModel.technicalInfoShown(false) } }
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
		// The subtitle menu's search, presented as the local player presents it.
		.sheet(isPresented: $viewModel.showSubtitleSearch) {
			SubtitleSearchView(viewModel: viewModel)
		}
	}

	private var technicalInfoVisible: Bool { viewModel.showTechnicalInfo && viewModel.capabilities.technicalInfo }

	/// What the slots are drawn at: the layout, the artwork's box, and the technical info card's width.
	private struct Slots {
		let layout: RemoteLayout
		let artwork: CGSize
		let infoWidth: CGFloat
	}

	/// One slot, alone in its place: the column, the side or the bottom band. The top bar draws its own three.
	@ViewBuilder
	private func slot(_ slot: RemoteSlot, _ slots: Slots) -> some View {
		let layout = slots.layout
		let artwork = slots.artwork
		let couched = layout == .landscape
		switch slot {
		case .header:
			RemoteHeader(viewModel: viewModel, model: model)
		case .artwork:
			ZStack {
				// The artwork's double tap seeks like the bar, so it rests when the bar does.
				RemoteArtwork(viewModel: viewModel, size: artwork)
					.overlay { if model.seekEnabled { artworkTaps } }
				// Over the image and never over the titles or the controls; the skip band and the seek pill are drawn
				// over it.
				if technicalInfoVisible {
					TechnicalInfoOverlay(viewModel: viewModel, compactWidth: slots.infoWidth, reportsShown: false)
						.padding(Self.infoInset)
						.frame(width: couched ? nil : artwork.width, height: couched ? nil : artwork.height)
				}
				Color.clear
					.overlay { if model.seekEnabled { seekPill } }
					.overlay(alignment: .bottom) {
						VStack(spacing: 0) {
							// A failure is said on the image, whatever the TV does, with Play here when it offers it. Within
							// the artwork however small it is and however long the message: the bands keep their height.
							if let failure = model.failure {
								RemoteFailureCard(
									message: failure,
									playHere: model.canPlayHere ? viewModel.str("playHere", "Play on this device") : nil,
									onPlayHere: screen.playHere
								)
								.layoutPriority(-1)
							}
							// The segment skip rests with the bar too, as it did above it, and waits while Play here is there.
							RemoteSkipBanner(viewModel: viewModel, allowed: model.showsSkip)
								.remoteInert(!model.seekEnabled)
						}
					}
					.frame(width: artwork.width, height: artwork.height)
					.clipShape(RoundedRectangle(cornerRadius: 8))
			}
			// Couched, the whole half: the panel centers on the image within it, wider than a poster.
			.frame(maxWidth: layout == .portrait || couched ? .infinity : nil, maxHeight: couched ? .infinity : nil)
		case .titles:
			// Couched, the title's capitals start level with the image's top.
			RemoteTitles(viewModel: viewModel, capsAtTop: couched)
				.frame(maxWidth: .infinity, alignment: .leading)
		case .bar:
			VStack(alignment: .leading, spacing: 8) {
				// The list the TV got is over and the phone knows what comes after it: offered, never counted down.
				if model.nextUpVisible, let next = viewModel.nextEpisode {
					RemoteNextUpCard(viewModel: viewModel, next: next, onContinue: screen.continueNextUp)
				}
				RemoteBar(viewModel: viewModel)
					.remoteInert(!model.seekEnabled)
			}
		case .transport:
			RemoteTransportRow(
				viewModel: viewModel, layout: layout, spinner: model.playShowsSpinner, showsPreviousNext: model.showsPreviousNext
			)
				.remoteInert(!model.transportEnabled)
				.frame(maxWidth: .infinity)
		case .bottomRow:
			RemoteBottomRow(viewModel: viewModel, targetName: targetName, model: model)
		}
	}

	/// A double tap on a half of the artwork seeks back or forward; seekPill shows it on that half. The layer runs left
	/// to right in every language, so the tap's x is from the physical left edge (RemoteGestures.artworkTapSeek).
	private var artworkTaps: some View {
		GeometryReader { box in
			Color.clear
				.contentShape(Rectangle())
				.gesture(SpatialTapGesture(count: 2).onEnded { tap in
					let fraction = Double(tap.location.x / max(box.size.width, 1))
					viewModel.seekWithPill(forward: RemoteGestures.artworkTapSeek(xFraction: fraction) > 0)
				})
		}
		.environment(\.layoutDirection, .leftToRight)
	}

	/// The chrome's pill on the half that was tapped, over the technical info panel; touches go through it.
	private var seekPill: some View {
		ZStack {
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
			}
		}
		.allowsHitTesting(false)
		.environment(\.layoutDirection, .leftToRight)
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

/// The couched top bar's height, as laid out; 0 when there is none.
private struct RemoteTopBarHeightKey: PreferenceKey {
	static let defaultValue: CGFloat = 0

	static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
		value = max(value, nextValue())
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

/// A pill under a message: Continue under the next episode.
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
