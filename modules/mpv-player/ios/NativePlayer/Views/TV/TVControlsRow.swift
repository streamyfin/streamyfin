#if os(tvOS)
import SwiftUI

/// The focusable button row under the transport bar — same configuration as
/// the JS TV player (Controls.tv.tsx): previous episode, previous chapter,
/// play/pause, next chapter, next episode, then quality / audio / subtitles /
/// technical info, plus the ±seconds jump buttons.
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
	case nextChapter, skipForward, nextEpisode
	case quality, audio, subtitles, speed, techInfo, episodes, more
}

@available(tvOS 26.0, *)
struct TVControlsRow: View {
	@ObservedObject var viewModel: PlayerViewModel
	/// Owned by the root view (which outlives this row): the last focused
	/// control, restored when the chrome reappears.
	@Binding var lastFocused: TVControl?
	@Namespace private var focusNamespace
	@FocusState private var focusedControl: TVControl?
	@Environment(\.resetFocus) private var resetFocus

	/// The control that should own default focus when the row (re)appears:
	/// the remembered one when it still exists, play/pause otherwise. The
	/// preference carries the memory — a programmatic FocusState write alone
	/// loses the race against the focus-engine update the VC kicks after the
	/// row mounts (which lands on the left-most button).
	private var defaultFocusTarget: TVControl {
		guard let lastFocused, isAvailable(lastFocused) else { return .playPause }
		return lastFocused
	}

	private func isAvailable(_ control: TVControl) -> Bool {
		switch control {
		case .previousEpisode, .nextEpisode:
			return viewModel.metadata?.isEpisode == true
		case .previousChapter, .nextChapter:
			return !viewModel.chapters.isEmpty
		case .quality:
			return !viewModel.qualityMenu.isEmpty
		case .audio:
			return !viewModel.audioMenu.isEmpty
		case .subtitles:
			return !viewModel.subtitleMenu.isEmpty
		case .episodes:
			return !viewModel.episodeList.isEmpty
		case .skipBack, .skipForward, .playPause, .speed, .techInfo, .more:
			return true
		}
	}

	var body: some View {
		HStack(spacing: 22) {
			if viewModel.metadata?.isEpisode == true {
				iconButton("backward.end.fill") { viewModel.playPreviousEpisode() }
					.focused($focusedControl, equals: .previousEpisode)
				.prefersDefaultFocus(defaultFocusTarget == .previousEpisode, in: focusNamespace)
			}
			iconButton(skipSymbol("gobackward", viewModel.seekBackwardSec)) {
				viewModel.seekBackward()
			}
			.focused($focusedControl, equals: .skipBack)
				.prefersDefaultFocus(defaultFocusTarget == .skipBack, in: focusNamespace)
			if !viewModel.chapters.isEmpty {
				iconButton("backward.fill") { viewModel.goToPreviousChapter() }
					.focused($focusedControl, equals: .previousChapter)
				.prefersDefaultFocus(defaultFocusTarget == .previousChapter, in: focusNamespace)
			}
			iconButton(viewModel.isPlaying ? "pause.fill" : "play.fill") {
				viewModel.togglePlayPause()
			}
			.focused($focusedControl, equals: .playPause)
				.prefersDefaultFocus(defaultFocusTarget == .playPause, in: focusNamespace)
			if !viewModel.chapters.isEmpty {
				iconButton("forward.fill") { viewModel.goToNextChapter() }
					.focused($focusedControl, equals: .nextChapter)
				.prefersDefaultFocus(defaultFocusTarget == .nextChapter, in: focusNamespace)
			}
			iconButton(skipSymbol("goforward", viewModel.seekForwardSec)) {
				viewModel.seekForward()
			}
			.focused($focusedControl, equals: .skipForward)
				.prefersDefaultFocus(defaultFocusTarget == .skipForward, in: focusNamespace)
			if viewModel.metadata?.isEpisode == true {
				iconButton("forward.end.fill") { viewModel.playNextEpisode() }
					.focused($focusedControl, equals: .nextEpisode)
				.prefersDefaultFocus(defaultFocusTarget == .nextEpisode, in: focusNamespace)
			}

			Spacer(minLength: 12)

			if !viewModel.episodeList.isEmpty {
				iconButton("rectangle.stack.badge.play") {
					viewModel.showEpisodeList = true
				}
				.focused($focusedControl, equals: .episodes)
				.prefersDefaultFocus(defaultFocusTarget == .episodes, in: focusNamespace)
			}
			if !viewModel.qualityMenu.isEmpty {
				qualityMenu
					.focused($focusedControl, equals: .quality)
				.prefersDefaultFocus(defaultFocusTarget == .quality, in: focusNamespace)
			}
			if !viewModel.audioMenu.isEmpty {
				audioMenu
					.focused($focusedControl, equals: .audio)
				.prefersDefaultFocus(defaultFocusTarget == .audio, in: focusNamespace)
			}
			if !viewModel.subtitleMenu.isEmpty {
				subtitlesMenu
					.focused($focusedControl, equals: .subtitles)
				.prefersDefaultFocus(defaultFocusTarget == .subtitles, in: focusNamespace)
			}
			speedMenu
				.focused($focusedControl, equals: .speed)
				.prefersDefaultFocus(defaultFocusTarget == .speed, in: focusNamespace)
			moreMenu
				.focused($focusedControl, equals: .more)
				.prefersDefaultFocus(defaultFocusTarget == .more, in: focusNamespace)
			iconButton("chevron.left.forwardslash.chevron.right") {
				viewModel.showTechnicalInfo.toggle()
			}
			.focused($focusedControl, equals: .techInfo)
				.prefersDefaultFocus(defaultFocusTarget == .techInfo, in: focusNamespace)
		}
		.focusScope(focusNamespace)
		.onChange(of: focusedControl) { newValue in
			if let newValue {
				lastFocused = newValue
			}
		}
		.onAppear {
			// Re-evaluate default focus AFTER the VC's post-mount focus kick,
			// so the scope's preference (the remembered control) wins over
			// the engine's left-most pick.
			DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
				resetFocus(in: focusNamespace)
				focusedControl = defaultFocusTarget
			}
		}
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

	private var moreMenu: some View {
		Menu {
			menuRow(
				label: viewModel.str("zoomToFill", "Zoom to fill"),
				selected: viewModel.isZoomedToFill
			) {
				viewModel.toggleZoomToFill()
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
			.font(.system(size: 26, weight: .semibold))
			.frame(width: 40, height: 40)
	}

	/// "gobackward.30"-style symbol when SF Symbols has the exact count.
	private func skipSymbol(_ base: String, _ seconds: Double) -> String {
		let n = Int(seconds.rounded())
		return [10, 15, 30, 45, 60, 75, 90].contains(n) ? "\(base).\(n)" : base
	}
}
#endif
