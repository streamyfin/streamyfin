#if os(iOS)
import SwiftUI

// The remote screen's six slots (design §3.1), which RemotePlayerRootView places by RemoteArrangement. Twin:
// RemoteSlots.kt.

/// 0xRRGGBB as a color.
func remoteColor(_ rgb: UInt32) -> Color {
	Color(
		red: Double((rgb >> 16) & 0xFF) / 255,
		green: Double((rgb >> 8) & 0xFF) / 255,
		blue: Double(rgb & 0xFF) / 255
	)
}

/// What is on or connected: icon and text, with a dot under the icon (design §3.3). The artwork's accent, set by
/// RemotePlayerRootView from the tint; remoteActiveColor until there is one.
private struct RemoteAccentKey: EnvironmentKey {
	static let defaultValue = remoteColor(PlayerConstants.remoteActiveColor)
}

extension EnvironmentValues {
	var remoteAccent: Color {
		get { self[RemoteAccentKey.self] }
		set { self[RemoteAccentKey.self] = newValue }
	}
}

private let remoteButton = CGFloat(PlayerConstants.remoteButtonSmall)

/// Header: the chevron that closes the screen without stopping the TV, and the "more" menu.
struct RemoteHeader: View {
	@ObservedObject var viewModel: PlayerViewModel
	let model: RemoteScreenModel

	var body: some View {
		HStack(spacing: 0) {
			RemoteChevron(viewModel: viewModel)
			Spacer(minLength: 0)
			if model.showsMoreMenu { RemoteMoreButton(viewModel: viewModel) }
		}
	}
}

/// The artwork, whole, in a square of the size RemoteMetrics gives.
struct RemoteArtwork: View {
	@ObservedObject var viewModel: PlayerViewModel
	let size: CGFloat

	var body: some View {
		ZStack {
			if let uri = viewModel.metadata?.artworkUri, let url = URL(string: uri) {
				RemoteImage(
				url: url,
				headers: RemoteImageHeaders.of(own: viewModel.metadata?.artworkHeaders, server: viewModel.imageHeaders)
			) {
					Color.white.opacity(0.08)
				}
				.scaledToFit()
			}
		}
		.frame(width: size, height: size)
		.clipShape(RoundedRectangle(cornerRadius: 8))
		.accessibilityHidden(true)
	}
}

/// Skip the segment the TV is in, as a band across the bottom of the artwork: the artwork's whole width, so a long
/// label in any language stays on one line (cut with an ellipsis past it; VoiceOver reads it whole). Hidden in auto
/// mode, where the TV skips by itself. It fades in and out without moving anything, the artwork being there in every
/// layout.
struct RemoteSkipBanner: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		let segment = viewModel.activeSegment.flatMap { $0.skipMode == "auto" ? nil : $0 }
		ZStack {
			if let segment {
				Button {
					viewModel.skipActiveSegment()
				} label: {
					HStack(spacing: 6) {
						Text(viewModel.skipLabel(for: segment.type))
							.font(.subheadline.weight(.semibold))
							.lineLimit(1)
							.truncationMode(.tail)
						Image(systemName: "forward.fill")
							.font(.system(size: 12, weight: .semibold))
							.accessibilityHidden(true)
					}
					.foregroundStyle(.white)
					.padding(.horizontal, 12)
					.frame(maxWidth: .infinity, minHeight: PlayerConstants.remoteSkipBannerHeight)
					// Smoked glass over the artwork: dark enough for white text on any image.
					.background(Color.black.opacity(0.35))
					.background(.ultraThinMaterial)
					.environment(\.colorScheme, .dark)
					.contentShape(Rectangle())
				}
				.buttonStyle(.plain)
				.transition(.opacity)
			}
		}
		.animation(.easeInOut(duration: 0.2), value: segment?.startSec)
	}
}

/// Title and subtitle, left-aligned; compact keeps each to one smaller line, for the couched top bar.
struct RemoteTitles: View {
	@ObservedObject var viewModel: PlayerViewModel
	let compact: Bool
	// Dynamic Type: each size grows with the text style it stands for, as Android's sp do.
	@ScaledMetric(relativeTo: .title2) private var titleSize: CGFloat = 22
	@ScaledMetric(relativeTo: .subheadline) private var compactTitleSize: CGFloat = 15
	@ScaledMetric(relativeTo: .subheadline) private var subtitleSize: CGFloat = 15
	@ScaledMetric(relativeTo: .caption) private var compactSubtitleSize: CGFloat = 12

	var body: some View {
		VStack(alignment: .leading, spacing: compact ? 1 : 4) {
			Text(viewModel.metadata?.title ?? "")
				.font(.system(size: compact ? compactTitleSize : titleSize, weight: .bold))
				.foregroundStyle(.white)
				.lineLimit(compact ? 1 : 2)
			if let subtitle = viewModel.metadata?.subtitle {
				Text(subtitle)
					.font(.system(size: compact ? compactSubtitleSize : subtitleSize))
					.foregroundStyle(.white.opacity(0.7))
					.lineLimit(compact ? 1 : 2)
			}
		}
	}
}

/// The bar, the local chrome's: chapter name, the bar with its marks and thumbnail bubble, elapsed on the left,
/// "Ends at" and the duration on the right. The segment skip is a band on the artwork, RemoteSkipBanner.
struct RemoteBar: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		VStack(alignment: .leading, spacing: 6) {
			CurrentChapterLabel(viewModel: viewModel, time: viewModel.time)
			PlayerBottomBar(viewModel: viewModel, time: viewModel.time, showsDuration: true)
		}
	}
}

/// Previous, back, play, forward, next: the chrome's transport at the remote sizes, play a white disc.
struct RemoteTransportRow: View {
	@ObservedObject var viewModel: PlayerViewModel
	let layout: RemoteLayout
	let spinner: Bool
	let showsPreviousNext: Bool

	var body: some View {
		PlayerCenterControls(
			viewModel: viewModel, time: viewModel.time, style: TransportStyle(RemoteTransport.of(layout)), showsSpinner: spinner,
			showsPreviousNext: showsPreviousNext
		)
	}
}

extension View {
	/// A control the TV's state leaves inactive: dimmed, deaf to touches, and dimmed to VoiceOver too.
	func remoteInert(_ inert: Bool) -> some View {
		opacity(inert ? PlayerConstants.remoteInertOpacity : 1)
			.disabled(inert)
	}
}

/// The bottom row: the TV on the left, episodes, audio and subtitles on the right.
struct RemoteBottomRow: View {
	@ObservedObject var viewModel: PlayerViewModel
	let targetName: String?
	let model: RemoteScreenModel

	var body: some View {
		HStack(spacing: 0) {
			RemoteTargetButton(viewModel: viewModel, targetName: targetName)
			Spacer(minLength: 0)
			RemoteTrackButtons(viewModel: viewModel, model: model)
		}
	}
}

/// Couched: the chevron, the titles, the TV, the track buttons and "more", in one bar across the top.
struct RemoteTopBar: View {
	@ObservedObject var viewModel: PlayerViewModel
	let targetName: String?
	let model: RemoteScreenModel

	var body: some View {
		HStack(spacing: 0) {
			RemoteChevron(viewModel: viewModel)
			RemoteTitles(viewModel: viewModel, compact: true)
				.frame(maxWidth: .infinity, alignment: .leading)
				.padding(.horizontal, 8)
			RemoteTargetButton(viewModel: viewModel, targetName: targetName)
			RemoteTrackButtons(viewModel: viewModel, model: model)
			if model.showsMoreMenu { RemoteMoreButton(viewModel: viewModel) }
		}
	}
}

private struct RemoteChevron: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		Button {
			viewModel.close()
		} label: {
			Image(systemName: "chevron.down")
				.font(.system(size: 22, weight: .semibold))
				.foregroundStyle(.white)
				.frame(width: remoteButton, height: remoteButton)
				.contentShape(Rectangle())
		}
		.accessibilityLabel(viewModel.str("close", "Close"))
	}
}

/// Quality and chapters: what the remote capabilities leave of the local "more" menu; nothing when it has neither.
private struct RemoteMoreButton: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		if RemoteMore.shows(chapters: viewModel.chapters.count, qualities: viewModel.qualityMenu.count) {
			MoreMenu(viewModel: viewModel) {
				Image(systemName: "ellipsis")
					.font(.system(size: 20, weight: .semibold))
					.foregroundStyle(.white)
					.frame(width: remoteButton, height: remoteButton)
					.contentShape(Rectangle())
			}
			.accessibilityLabel(viewModel.str("more", "More"))
		}
	}
}

/// The TV's name with the Cast icon; opens the Cast sheet, which points at it. In the active color: the screen
/// only stands while a TV plays, so its TV is the connected one.
private struct RemoteTargetButton: View {
	@ObservedObject var viewModel: PlayerViewModel
	let targetName: String?
	@ScaledMetric(relativeTo: .footnote) private var nameSize: CGFloat = 14
	@State private var frame: CGRect = .zero
	@Environment(\.remoteAccent) private var accent

	var body: some View {
		Button {
			viewModel.openOutputSheet(anchor: frame)
		} label: {
			HStack(spacing: 8) {
				VStack(spacing: 3) {
					CastGlyph(connected: true)
						.fill(accent)
						.frame(width: 20, height: 20)
					ActiveDot(active: true)
				}
				.padding(.top, 7)
				if let targetName {
					Text(targetName)
						.font(.system(size: nameSize, weight: .semibold))
						.foregroundStyle(accent)
						.lineLimit(1)
				}
			}
			.frame(minHeight: remoteButton)
			.padding(.horizontal, 8)
			.contentShape(Rectangle())
		}
		.background(
			GeometryReader { proxy in
				Color.clear
					.onAppear { frame = proxy.frame(in: .global) }
					.onChange(of: proxy.frame(in: .global)) { frame = $0 }
			}
		)
		.accessibilityLabel(targetName ?? viewModel.castButtonLabel)
		.accessibilityValue(viewModel.castButtonState)
	}
}

/// Episodes, audio and subtitles, each when it has something to offer; subtitles light up while on.
/// Episodes, audio and subtitles, each when it has something to offer. Audio and subtitles rest while nothing is
/// loaded on the TV: a track change would have nothing to act on.
/// Episodes, audio and subtitles, each when it has something to offer and the player is not reduced.
private struct RemoteTrackButtons: View {
	@ObservedObject var viewModel: PlayerViewModel
	let model: RemoteScreenModel

	private var tracksEnabled: Bool { model.trackMenusEnabled }

	var body: some View {
		if model.showsEpisodes && !viewModel.isSyncPlayActive && !viewModel.episodeList.isEmpty {
			Button {
				viewModel.showEpisodeList = true
			} label: {
				ActiveIcon(systemName: "list.bullet", active: false)
			}
			.accessibilityLabel(viewModel.str("episodes", "Episodes"))
		}
		if model.showsTrackMenus && !viewModel.audioMenu.isEmpty {
			AudioMenu(viewModel: viewModel) { ActiveIcon(systemName: "waveform", active: false) }
				.accessibilityLabel(viewModel.str("audio", "Audio"))
				.remoteInert(!tracksEnabled)
		}
		if model.showsTrackMenus && !viewModel.subtitleMenu.isEmpty {
			let on = RemoteActive.subtitlesOn(selectedIndex: viewModel.subtitleMenu.first(where: { $0.selected })?.jellyfinIndex)
			SubtitleMenu(viewModel: viewModel) { ActiveIcon(systemName: "captions.bubble", active: on) }
				.accessibilityLabel(viewModel.str("subtitles", "Subtitles"))
				.remoteInert(!tracksEnabled)
		}
	}
}

/// An icon in the active color with a dot under it while active, white otherwise; the dot keeps its room.
private struct ActiveIcon: View {
	let systemName: String
	let active: Bool
	@Environment(\.remoteAccent) private var accent

	var body: some View {
		VStack(spacing: 3) {
			Image(systemName: systemName)
				.font(.system(size: 18, weight: .semibold))
				.foregroundStyle(active ? accent : .white)
				.frame(height: 22)
			ActiveDot(active: active)
		}
		.padding(.top, 7)
		.frame(width: remoteButton, height: remoteButton)
		.contentShape(Rectangle())
	}
}

private struct ActiveDot: View {
	let active: Bool
	@Environment(\.remoteAccent) private var accent

	var body: some View {
		Circle()
			.fill(active ? accent : .clear)
			.frame(width: 4, height: 4)
	}
}
#endif
