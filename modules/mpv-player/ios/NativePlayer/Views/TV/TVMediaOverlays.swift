#if os(tvOS)
import SwiftUI

/// Skip intro/credits pill — non-focusable on purpose, and shown only while
/// the chrome is hidden: Select triggers the skip via the VC recognizers
/// (Play/Pause stays playback-only). In the full chrome the controls row
/// hosts a focusable Skip button instead.
@available(tvOS 26.0, *)
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
		// Liquid Glass, matching the .glass button style of the controls row —
		// a flat black capsule reads as a foreign tint next to the real material.
		.glassEffect(.regular, in: Capsule())
	}
}

/// Next-episode countdown card. Select = play now, Menu = cancel (VC
/// recognizers); Play/Pause stays playback-only and pausing freezes the
/// countdown. Mirrors NextEpisodeCountdownView content.
@available(tvOS 26.0, *)
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
		.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 18))
	}
}

/// "Are you still watching?" — focusable card (the VC hands the remote to
/// SwiftUI focus while it is up). Same actions as the iOS overlay. The
/// affirmative answer owns default focus so one Select continues playback.
@available(tvOS 26.0, *)
struct TVStillWatchingCard: View {
	private enum Choice: Hashable { case continueWatching, goBack }

	@ObservedObject var viewModel: PlayerViewModel
	let focusCoordinator: TVFocusCoordinator
	@FocusState private var focusedButton: Choice?

	var body: some View {
		VStack(spacing: 28) {
			Text(viewModel.str("stillWatching", "Are you still watching?"))
				.font(.title3.weight(.semibold))
				.foregroundStyle(.white)
			HStack(spacing: 20) {
				Button(viewModel.str("continueWatching", "Continue watching")) {
					viewModel.continueWatchingTapped()
				}
				.focused($focusedButton, equals: .continueWatching)
				Button(viewModel.str("goBack", "Go back")) {
					viewModel.stillWatchingCloseTapped()
				}
				.focused($focusedButton, equals: .goBack)
			}
		}
		.padding(48)
		.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 24))
		.defaultFocus($focusedButton, .continueWatching, priority: .userInitiated)
		.focusSection()
		.tvFocusZone(
			.stillWatching, coordinator: focusCoordinator, focus: $focusedButton,
			target: { Choice.continueWatching })
	}
}

/// Horizontal episode shelf (bottom third). Focusable cards; Select fires
/// the existing onEpisodeSelected intent via viewModel.selectEpisode. The
/// card of the CURRENTLY PLAYING episode owns default focus — the engine
/// scrolls it into view on its first pick (the coordinator only points
/// focus here after the shelf has committed), so the shelf opens oriented
/// on where you are instead of at episode 1.
@available(tvOS 26.0, *)
struct TVEpisodeShelf: View {
	@ObservedObject var viewModel: PlayerViewModel
	let focusCoordinator: TVFocusCoordinator
	@FocusState private var focusedEpisode: Int?
	/// See TVControlsRow.focusGate. It matters more here: the shelf's
	/// target is almost never the left-most card, so the engine's repair
	/// had no chance of guessing it.
	@State private var focusGate: Int?

	/// Index of the episode that should take focus when the shelf opens.
	private var defaultFocusIndex: Int {
		viewModel.episodeList.firstIndex { $0.isCurrent } ?? 0
	}

	var body: some View {
		VStack(alignment: .leading, spacing: 16) {
			Text(viewModel.str("episodes", "Episodes"))
				.font(.title3.weight(.semibold))
				.foregroundStyle(.white)
				.padding(.horizontal, 80)
			ScrollView(.horizontal, showsIndicators: false) {
				HStack(spacing: 28) {
					ForEach(Array(viewModel.episodeList.enumerated()), id: \.offset) {
						index, episode in
						// Focus modifiers live on the artwork Button inside, not
						// out here: the lockup's VStack is not the focusable
						// element any more, only the card is.
						episodeCard(episode, index: index)
					}
				}
				.padding(.horizontal, 80)
				.padding(.vertical, 30)
			}
		}
		// Grouping AFTER defaultFocus — see the note in TVControlsRow.
		.defaultFocus($focusedEpisode, defaultFocusIndex, priority: .userInitiated)
		.focusSection()
		.padding(.vertical, 30)
		.frame(maxWidth: .infinity, alignment: .leading)
		.background(
			// Darkness arrives early (75% black a third of the way down) so
			// the cards sit on solid ground; only the top edge stays a fade.
			LinearGradient(
				stops: [
					.init(color: .black.opacity(0), location: 0),
					.init(color: .black.opacity(0.75), location: 0.35),
					.init(color: .black.opacity(0.95), location: 1),
				],
				startPoint: .top, endPoint: .bottom
			)
			// Bleed past the tvOS overscan insets on every touched edge —
			// .bottom alone leaves ~90pt gaps at the left/right screen edges.
			.ignoresSafeArea()
		)
		.onExitCommand { viewModel.showEpisodeList = false }
		// The shelf MUST assert its target itself. `.defaultFocus` above is
		// inert here twice over: it is documented as evaluated when the window
		// first appears (the shelf mounts per opening), and inside a ScrollView
		// it is ignored outright (Apple FB706321 - focus goes to the first card
		// visible on the left). Naming the index through @FocusState is what
		// actually scrolls the playing episode into view and focuses it.
		.onChange(of: focusedEpisode) { newValue in
			// Focus landed - let the other cards back in so the shelf scrolls.
			if newValue != nil { focusGate = nil }
		}
		.tvFocusZone(
			.shelf, coordinator: focusCoordinator, focus: $focusedEpisode,
			gate: $focusGate, target: { defaultFocusIndex })
	}

	/// Everything lives INSIDE the card - title and progress overlay the
	/// artwork rather than sitting under it, which is how the TV app's
	/// in-player episode shelf is built. `.card` is what carries the tvOS
	/// focus float (the layer tilts toward your thumb and a specular
	/// highlight tracks across it); it wraps whatever it is given, and here
	/// what it is given is the whole card, so there is nothing left over for
	/// it to draw a platter around.
	private func episodeCard(_ episode: EpisodeListItemRecord, index: Int) -> some View {
		Button {
			viewModel.selectEpisode(episode)
		} label: {
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
				// Frosted gradient rather than a flat black band: a material
				// masked to fade in toward the bottom keeps the artwork visible
				// through it while still grounding the title. The black
				// underlay carries the contrast the material alone cannot
				// guarantee over a bright frame.
				LinearGradient(
					colors: [.black.opacity(0), .black.opacity(0.55)],
					startPoint: .top, endPoint: .bottom
				)
				.frame(height: 110)
				.frame(maxHeight: .infinity, alignment: .bottom)
				Rectangle()
					.fill(.ultraThinMaterial)
					.mask(
						LinearGradient(
							stops: [
								.init(color: .clear, location: 0),
								.init(color: .black.opacity(0.65), location: 0.5),
								.init(color: .black, location: 1),
							],
							startPoint: .top, endPoint: .bottom
						)
					)
					.frame(height: 110)
					.frame(maxHeight: .infinity, alignment: .bottom)
				VStack(alignment: .leading, spacing: 8) {
					Text(
						episode.indexNumber.map { "\($0). \(episode.title)" } ?? episode.title
					)
					.font(.system(size: 20, weight: .medium))
					.foregroundStyle(.white)
					.lineLimit(1)
					if episode.progressPercent > 0 {
						GeometryReader { geometry in
							Capsule().fill(.white.opacity(0.3))
								.overlay(alignment: .leading) {
									Capsule().fill(.white)
										.frame(
											width: geometry.size.width
												* CGFloat(min(max(episode.progressPercent / 100, 0), 1)))
								}
						}
						.frame(height: 4)
					}
				}
				.padding(.horizontal, 14)
				.padding(.bottom, 12)
			}
			.frame(width: 300, height: 168)
			.overlay(alignment: .topLeading) {
				// Matches the app's existing badge (TVPosterCard.tsx): solid
				// white, black content, radius 8, top-left. Replaces the white
				// border, which competed with the focus ring and read as a
				// second focus state. Inside the clip so it rounds with the card.
				if episode.isCurrent {
					HStack(spacing: 6) {
						Image(systemName: "play.fill")
							.font(.system(size: 13, weight: .bold))
						Text(viewModel.str("nowPlaying", "Now Playing"))
							.font(.system(size: 15, weight: .bold))
					}
					.foregroundStyle(.black)
					.padding(.horizontal, 10)
					.padding(.vertical, 6)
					.background(.white, in: RoundedRectangle(cornerRadius: 8))
					.padding(10)
				}
			}
			.clipShape(RoundedRectangle(cornerRadius: 12))
		}
		.buttonStyle(.card)
		.focused($focusedEpisode, equals: index)
		.tvFocusGated(focusGate, index)
	}
}
#endif
