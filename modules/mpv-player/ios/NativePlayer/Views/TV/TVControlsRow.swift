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
	case quality, audio, subtitles, speed, techInfo
}

@available(tvOS 26.0, *)
struct TVControlsRow: View {
	@ObservedObject var viewModel: PlayerViewModel
	/// Owned by the root view (which outlives this row): the last focused
	/// control, restored when the chrome reappears.
	@Binding var lastFocused: TVControl?
	@Namespace private var focusNamespace
	@FocusState private var focusedControl: TVControl?

	var body: some View {
		HStack(spacing: 22) {
			if viewModel.metadata?.isEpisode == true {
				iconButton("backward.end.fill") { viewModel.playPreviousEpisode() }
					.focused($focusedControl, equals: .previousEpisode)
			}
			iconButton(skipSymbol("gobackward", viewModel.seekBackwardSec)) {
				viewModel.seekBackward()
			}
			.focused($focusedControl, equals: .skipBack)
			if !viewModel.chapters.isEmpty {
				iconButton("backward.fill") { viewModel.goToPreviousChapter() }
					.focused($focusedControl, equals: .previousChapter)
			}
			iconButton(viewModel.isPlaying ? "pause.fill" : "play.fill") {
				viewModel.togglePlayPause()
			}
			.focused($focusedControl, equals: .playPause)
			.prefersDefaultFocus(in: focusNamespace)
			if !viewModel.chapters.isEmpty {
				iconButton("forward.fill") { viewModel.goToNextChapter() }
					.focused($focusedControl, equals: .nextChapter)
			}
			iconButton(skipSymbol("goforward", viewModel.seekForwardSec)) {
				viewModel.seekForward()
			}
			.focused($focusedControl, equals: .skipForward)
			if viewModel.metadata?.isEpisode == true {
				iconButton("forward.end.fill") { viewModel.playNextEpisode() }
					.focused($focusedControl, equals: .nextEpisode)
			}

			Spacer(minLength: 12)

			if !viewModel.qualityMenu.isEmpty {
				qualityMenu
					.focused($focusedControl, equals: .quality)
			}
			if !viewModel.audioMenu.isEmpty {
				audioMenu
					.focused($focusedControl, equals: .audio)
			}
			if !viewModel.subtitleMenu.isEmpty {
				subtitlesMenu
					.focused($focusedControl, equals: .subtitles)
			}
			speedMenu
				.focused($focusedControl, equals: .speed)
			iconButton("chevron.left.forwardslash.chevron.right") {
				viewModel.showTechnicalInfo.toggle()
			}
			.focused($focusedControl, equals: .techInfo)
		}
		.focusScope(focusNamespace)
		.onChange(of: focusedControl) { newValue in
			if let newValue {
				lastFocused = newValue
			}
		}
		.onAppear {
			// Restore the remembered control (fall back to play/pause). The
			// async hop lets the row finish mounting first; if the target no
			// longer exists (e.g. chapters gone after an episode swap) the
			// assignment is a no-op and prefersDefaultFocus wins instead.
			DispatchQueue.main.async {
				focusedControl = lastFocused ?? .playPause
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
