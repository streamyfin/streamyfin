#if os(tvOS)
import SwiftUI

/// The focusable button row under the transport bar — same configuration as
/// the JS TV player (Controls.tv.tsx): previous episode, previous chapter,
/// play/pause, next chapter, next episode, then quality / audio / subtitles,
/// plus the ±seconds jump buttons (technical info lives in the More menu).
///
/// Dropdowns are NATIVE SwiftUI Menus — the system Liquid Glass popup with
/// system focus handling — mirroring the iOS PlayerTopBar pattern 1:1
/// (Button rows with checkmark Labels, .menuOrder(.fixed), and
/// menuInteractionStarted for the longer auto-hide grace while a menu is
/// open, since SwiftUI cannot observe the popup's open state).
///
/// tvOS 26+ only by design: Menu needs tvOS 17 and the glass button style
/// needs 26, and pre-26 boxes keep the recognizer-driven transport without
/// this row.
/// Stable identifiers for focus memory across chrome hide/show cycles.
enum TVControl: Hashable {
	case previousEpisode, skipBack, previousChapter, playPause
	case nextChapter, skipForward, nextEpisode, skipSegment
	case quality, audio, subtitles, speed, episodes, more, chapters
}

@available(tvOS 26.0, *)
struct TVControlsRow: View {
	@ObservedObject var viewModel: PlayerViewModel
	/// Owned by the root view (which outlives this row): the last focused
	/// control, restored when the chrome reappears.
	@Binding var lastFocused: TVControl?
	@ObservedObject var focusCoordinator: TVFocusCoordinator
	@FocusState private var focusedControl: TVControl?
	/// While non-nil, every control except this one is out of the focus
	/// graph. Held for the frame in which the chrome host joins the graph,
	/// so the engine's geometric repair has exactly one candidate - the
	/// remembered control - instead of the left-most button. Cleared the
	/// moment focus lands (below), with a backstop in tvFocusZone.
	@State private var focusGate: TVControl?

	/// The control that should own default focus when the row (re)appears:
	/// the remembered one when it still exists, play/pause otherwise. Fed to
	/// `.defaultFocus(_:_:priority:)` below, evaluated when the scope takes
	/// focus — which the coordinator triggers once this host is live.
	private var defaultFocusTarget: TVControl {
		guard let lastFocused, isAvailable(lastFocused) else { return .playPause }
		return lastFocused
	}

	private func isAvailable(_ control: TVControl) -> Bool {
		switch control {
		case .previousEpisode, .nextEpisode:
			return viewModel.metadata?.isEpisode == true
		case .previousChapter, .nextChapter, .chapters:
			return !viewModel.chapters.isEmpty
		case .quality:
			return !viewModel.qualityMenu.isEmpty
		case .audio:
			return !viewModel.audioMenu.isEmpty
		case .subtitles:
			return !viewModel.subtitleMenu.isEmpty || viewModel.subtitleSearchEnabled
		case .episodes:
			return !viewModel.episodeList.isEmpty
		case .skipSegment:
			return viewModel.activeSegment != nil
		case .skipBack, .skipForward, .playPause, .speed, .more:
			return true
		}
	}

	var body: some View {
		HStack(spacing: 22) {
			if viewModel.metadata?.isEpisode == true {
				iconButton("backward.end.fill") { viewModel.playPreviousEpisode() }
					.focused($focusedControl, equals: .previousEpisode)
					.tvFocusGated(focusGate, TVControl.previousEpisode)
			}
			iconButton(skipSymbol("gobackward", viewModel.seekBackwardSec)) {
				viewModel.seekBackward()
			}
			.focused($focusedControl, equals: .skipBack)
			.tvFocusGated(focusGate, TVControl.skipBack)
			if !viewModel.chapters.isEmpty {
				iconButton("backward.fill") { viewModel.goToPreviousChapter() }
					.focused($focusedControl, equals: .previousChapter)
					.tvFocusGated(focusGate, TVControl.previousChapter)
			}
			iconButton(viewModel.isPlaying ? "pause.fill" : "play.fill") {
				viewModel.togglePlayPause()
			}
			.focused($focusedControl, equals: .playPause)
			.tvFocusGated(focusGate, TVControl.playPause)
			if !viewModel.chapters.isEmpty {
				iconButton("forward.fill") { viewModel.goToNextChapter() }
					.focused($focusedControl, equals: .nextChapter)
					.tvFocusGated(focusGate, TVControl.nextChapter)
			}
			iconButton(skipSymbol("goforward", viewModel.seekForwardSec)) {
				viewModel.seekForward()
			}
			.focused($focusedControl, equals: .skipForward)
			.tvFocusGated(focusGate, TVControl.skipForward)
			if viewModel.metadata?.isEpisode == true {
				iconButton("forward.end.fill") { viewModel.playNextEpisode() }
					.focused($focusedControl, equals: .nextEpisode)
					.tvFocusGated(focusGate, TVControl.nextEpisode)
			}
			// Focus-mode counterpart of TVSkipPill: while the row owns the
			// remote the pill would just be a non-focusable impostor, so the
			// skip action lives here instead (the pill shows only with the
			// chrome hidden). Unmounts when the segment ends — a focus hop to
			// a neighbor then is accepted; isAvailable() already reroutes the
			// remembered default to play/pause.
			if let segment = viewModel.activeSegment {
				Button {
					viewModel.skipActiveSegment()
				} label: {
					Text(
						segment.type == "Intro"
							? viewModel.str("skipIntro", "Skip Intro")
							: viewModel.str("skipCredits", "Skip Credits")
					)
					.font(.system(size: 22, weight: .semibold))
					.frame(height: 34)
				}
				.buttonStyle(.glass)
				.focused($focusedControl, equals: .skipSegment)
				.tvFocusGated(focusGate, TVControl.skipSegment)
			}

			Spacer(minLength: 12)

			if !viewModel.episodeList.isEmpty {
				iconButton("rectangle.stack.badge.play") {
					viewModel.showEpisodeList = true
				}
				.focused($focusedControl, equals: .episodes)
				.tvFocusGated(focusGate, TVControl.episodes)
			}
			if !viewModel.chapters.isEmpty {
				chaptersMenu
					.focused($focusedControl, equals: .chapters)
					.tvFocusGated(focusGate, TVControl.chapters)
			}
			if !viewModel.qualityMenu.isEmpty {
				qualityMenu
					.focused($focusedControl, equals: .quality)
					.tvFocusGated(focusGate, TVControl.quality)
			}
			if !viewModel.audioMenu.isEmpty {
				audioMenu
					.focused($focusedControl, equals: .audio)
					.tvFocusGated(focusGate, TVControl.audio)
			}
			// Also mounted with no subtitle tracks when remote search is
			// available — the search entry is then the way to get some.
			if !viewModel.subtitleMenu.isEmpty || viewModel.subtitleSearchEnabled {
				subtitlesMenu
					.focused($focusedControl, equals: .subtitles)
					.tvFocusGated(focusGate, TVControl.subtitles)
			}
			speedMenu
				.focused($focusedControl, equals: .speed)
				.tvFocusGated(focusGate, TVControl.speed)
			moreMenu
				.focused($focusedControl, equals: .more)
				.tvFocusGated(focusGate, TVControl.more)
		}
		// The row's focus memory. `.userInitiated` is load-bearing: at the
		// default priority the engine's automatic choice (the LEFT-MOST
		// control) wins and focus visibly slides from there to the
		// remembered button on every summon. This is also why the older
		// `prefersDefaultFocus(_:in:)` was dropped — for a FocusState-driven
		// row it never took effect at all, with or without resetFocus.
		//
		// ORDER IS LOAD-BEARING: the grouping modifier must come AFTER
		// defaultFocus. Reversed, the grouping wins and the preference is
		// silently ignored — Swiftfin shipped exactly that bug on tvOS
		// (jellyfin/Swiftfin #2178/#2180) and fixed it by this reordering.
		.defaultFocus($focusedControl, defaultFocusTarget, priority: .userInitiated)
		.focusSection()
		.onChange(of: focusedControl) { newValue in
			if let newValue {
				TVFocusLog.log.info(
					"row focus -> \(String(describing: newValue), privacy: .public)")
				lastFocused = newValue
				// Focus has landed: let the rest of the row back into the
				// focus graph. Adding focusable siblings does not move an
				// already-held focus, so this is invisible.
				focusGate = nil
				// Navigating the row counts as interaction — keep the chrome
				// up while the user is moving between buttons.
				viewModel.scheduleAutoHide()
			}
		}
		// Backstop for `.defaultFocus` above, which Apple documents as
		// evaluated "when the window first appears" - this row remounts per
		// summon, which is outside that guarantee. The coordinator now
		// publishes this BEFORE it touches the focus engine, so in the good
		// case the write below is the engine's first and only instruction and
		// there is no left-most pick to slide away from.
		.tvFocusZone(
			.chrome, coordinator: focusCoordinator, focus: $focusedControl,
			gate: $focusGate, target: { defaultFocusTarget })
	}

	// MARK: - Native menus (mirror of PlayerTopBar)

	private var qualityMenu: some View {
		Menu {
			ForEach(Array(viewModel.qualityMenu.enumerated()), id: \.offset) { _, item in
				menuRow(label: item.label, selected: item.selected) {
					viewModel.selectQuality(item)
				}
			}
		} label: {
			icon("speedometer")
		}
		.menuOrder(.fixed)
		.buttonStyle(.glass)
		.buttonBorderShape(.circle)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("quality", "Quality"))
	}

	private var audioMenu: some View {
		Menu {
			trackMenuItems(viewModel.audioMenu) { viewModel.selectAudio($0) }
			Menu {
				ForEach(PlayerViewModel.syncOffsetPresets, id: \.self) { offset in
					menuRow(
						label: offsetLabel(offset),
						selected: abs(viewModel.audioDelay - offset) < 0.001
					) {
						viewModel.setAudioDelay(offset)
					}
				}
			} label: {
				Text(viewModel.str("audioSync", "Audio sync"))
			}
			Menu {
				ForEach(PlayerViewModel.volumeBoostPresets, id: \.self) { percent in
					menuRow(
						label: "\(percent)%",
						selected: viewModel.volumeBoostPercent == percent
					) {
						viewModel.setVolumeBoost(percent)
					}
				}
			} label: {
				Text(viewModel.str("volumeBoost", "Volume boost"))
			}
			menuRow(
				label: viewModel.str("dialogueBoost", "Dialogue boost"),
				selected: viewModel.dialogueBoostEnabled
			) {
				viewModel.toggleDialogueBoost()
			}
			menuRow(
				label: viewModel.str("monoAudio", "Mono audio"),
				selected: viewModel.monoAudioEnabled
			) {
				viewModel.toggleMonoAudio()
			}
		} label: {
			icon("speaker.wave.2.fill")
		}
		.menuOrder(.fixed)
		.buttonStyle(.glass)
		.buttonBorderShape(.circle)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("audio", "Audio"))
	}

	/// Subtitle track picker plus the nested size submenu (iOS parity).
	private var subtitlesMenu: some View {
		Menu {
			trackMenuItems(viewModel.subtitleMenu) { viewModel.selectSubtitle($0) }
			Menu {
				ForEach(PlayerViewModel.subtitleScalePresets, id: \.self) { preset in
					menuRow(
						label: "\(Int((preset * 100).rounded()))%",
						selected: abs(viewModel.subtitleScale - preset) < 0.001
					) {
						viewModel.setSubtitleScale(preset)
					}
				}
			} label: {
				Text(viewModel.str("subtitleSize", "Subtitle size"))
			}
			Menu {
				ForEach(PlayerViewModel.syncOffsetPresets, id: \.self) { offset in
					menuRow(
						label: offsetLabel(offset),
						selected: abs(viewModel.subtitleDelay - offset) < 0.001
					) {
						viewModel.setSubtitleDelay(offset)
					}
				}
			} label: {
				Text(viewModel.str("subtitleSync", "Subtitle sync"))
			}
			if viewModel.subtitleSearchEnabled {
				Button {
					// The panel is a focus overlay: hide the chrome so its
					// buttons are the only focusable content while it is up
					// (closeSubtitleSearch brings the chrome back).
					viewModel.controlsVisible = false
					viewModel.openSubtitleSearch()
				} label: {
					Label(
						viewModel.str("searchSubtitles", "Search subtitles"),
						systemImage: "magnifyingglass")
				}
			}
		} label: {
			icon("captions.bubble.fill")
		}
		.menuOrder(.fixed)
		.buttonStyle(.glass)
		.buttonBorderShape(.circle)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("subtitles", "Subtitles"))
	}

	private var speedMenu: some View {
		Menu {
			ForEach([0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0], id: \.self) { option in
				menuRow(
					label: option == 1.0 ? "1×" : String(format: "%g×", option),
					selected: abs(viewModel.speed - option) < 0.001
				) {
					viewModel.setSpeed(option)
				}
			}
		} label: {
			icon("timer")
		}
		.menuOrder(.fixed)
		.buttonStyle(.glass)
		.buttonBorderShape(.circle)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("speed", "Speed"))
	}

	/// Direct chapter jumps — iOS keeps this in the More menu; on TV the
	/// prev/next chapter buttons already advertise chapters, so the list gets
	/// its own glass button beside them. The current chapter is checkmarked
	/// (menuRow), which iOS doesn't do — on TV the popup is the only place
	/// showing where you are.
	private var chaptersMenu: some View {
		Menu {
			ForEach(Array(viewModel.chapters.enumerated()), id: \.offset) { index, chapter in
				menuRow(
					label:
						"\(chapter.name ?? "\(index + 1)") — \(formatTime(chapter.startSec))",
					selected: index == viewModel.currentChapterIndex
				) {
					viewModel.seek(to: chapter.startSec)
				}
			}
		} label: {
			icon("bookmark")
		}
		.menuOrder(.fixed)
		.buttonStyle(.glass)
		.buttonBorderShape(.circle)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("chapters", "Chapters"))
	}

	private var moreMenu: some View {
		Menu {
			menuRow(
				label: viewModel.str("zoomToFill", "Zoom to fill"),
				selected: viewModel.isZoomedToFill
			) {
				viewModel.toggleZoomToFill()
			}
			menuRow(
				label: viewModel.str("technicalInfo", "Technical info"),
				selected: viewModel.showTechnicalInfo
			) {
				viewModel.showTechnicalInfo.toggle()
			}
		} label: {
			icon("ellipsis")
		}
		.menuOrder(.fixed)
		.buttonStyle(.glass)
		.buttonBorderShape(.circle)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
	}

	private func offsetLabel(_ offset: Double) -> String {
		offset == 0 ? "0 s" : String(format: "%+g s", offset)
	}

	private func trackMenuItems(
		_ items: [TrackMenuItemRecord],
		onSelect: @escaping (TrackMenuItemRecord) -> Void
	) -> some View {
		ForEach(Array(items.enumerated()), id: \.offset) { _, item in
			menuRow(label: item.label, selected: item.selected) {
				onSelect(item)
			}
		}
	}

	private func menuRow(
		label: String, selected: Bool, action: @escaping () -> Void
	) -> some View {
		Button(action: action) {
			if selected {
				Label(label, systemImage: "checkmark")
			} else {
				Text(label)
			}
		}
	}

	// MARK: - Transport icon buttons

	private func iconButton(_ systemName: String, action: @escaping () -> Void) -> some View {
		Button(action: action) {
			icon(systemName)
		}
		.buttonStyle(.glass)
		.buttonBorderShape(.circle)
	}

	private func icon(_ systemName: String) -> some View {
		Image(systemName: systemName)
			.font(.system(size: 22, weight: .semibold))
			.frame(width: 34, height: 34)
	}

	/// "gobackward.30"-style symbol when SF Symbols has the exact count.
	private func skipSymbol(_ base: String, _ seconds: Double) -> String {
		let n = Int(seconds.rounded())
		return [10, 15, 30, 45, 60, 75, 90].contains(n) ? "\(base).\(n)" : base
	}
}
#endif
