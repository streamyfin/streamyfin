#if os(iOS)
import SwiftUI

// The chrome's menus, apart from the bar that shows them: the local top bar and the remote screen's rows open the
// same ones. Each takes its button's label; the menu reads the capabilities as it did in the bar. Twin: PlayerMenus.kt.

/// Playback speed presets.
struct SpeedMenu<MenuLabel: View>: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ViewBuilder let label: () -> MenuLabel

	var body: some View {
		Menu {
			SpeedMenuEntries(viewModel: viewModel)
		} label: {
			label()
		}
		.menuOrder(.fixed)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("speed", "Speed"))
	}
}

/// The speed presets, as the entries of a menu: the speed menu's, or a submenu of More in a compact bar.
struct SpeedMenuEntries: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		ForEach([0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0], id: \.self) { option in
			Button {
				viewModel.setSpeed(option)
			} label: {
				if abs(viewModel.speed - option) < 0.001 {
					Label(speedLabel(option), systemImage: "checkmark")
				} else {
					Text(speedLabel(option))
				}
			}
		}
	}
}

/// Audio track picker plus nested sync-offset (mpv audio-delay), volume
/// boost, and dialogue boost entries.
struct AudioMenu<MenuLabel: View>: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ViewBuilder let label: () -> MenuLabel

	var body: some View {
		Menu {
			TrackMenuItems.make(viewModel.audioMenu) { viewModel.selectAudio($0) }
			if viewModel.capabilities.decoderSettings {
				Divider()
				Menu {
					SyncOffsetEntries.make(current: viewModel.audioDelay) { viewModel.setAudioDelay($0) }
				} label: {
					Label(viewModel.str("audioSync", "Audio sync"), systemImage: "clock.arrow.2.circlepath")
				}
				volumeBoostMenu
				dialogueBoostButton
				monoAudioButton
			}
		} label: {
			label()
		}
		.menuOrder(.fixed)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("audio", "Audio"))
	}

	private var volumeBoostMenu: some View {
		Menu {
			ForEach(PlayerViewModel.volumeBoostPresets, id: \.self) { percent in
				Button {
					viewModel.setVolumeBoost(percent)
				} label: {
					if viewModel.volumeBoostPercent == percent {
						Label(boostLabel(percent), systemImage: "checkmark")
					} else {
						Text(boostLabel(percent))
					}
				}
			}
		} label: {
			Label(viewModel.str("volumeBoost", "Volume boost"), systemImage: "speaker.wave.3")
		}
	}

	private var dialogueBoostButton: some View {
		Button {
			viewModel.toggleDialogueBoost()
		} label: {
			if viewModel.dialogueBoostEnabled {
				Label(viewModel.str("dialogueBoost", "Dialogue boost"), systemImage: "checkmark")
			} else {
				Label(viewModel.str("dialogueBoost", "Dialogue boost"), systemImage: "speaker.wave.2")
			}
		}
	}

	private var monoAudioButton: some View {
		Button {
			viewModel.toggleMonoAudio()
		} label: {
			if viewModel.monoAudioEnabled {
				Label(viewModel.str("monoAudio", "Mono audio"), systemImage: "checkmark")
			} else {
				Label(viewModel.str("monoAudio", "Mono audio"), systemImage: "speaker.wave.1")
			}
		}
	}

	private func boostLabel(_ percent: Int) -> String {
		percent == 100 ? viewModel.str("off", "Off") : "\(percent)%"
	}
}

/// Subtitle track picker plus the shared subtitle-size control.
struct SubtitleMenu<MenuLabel: View>: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ViewBuilder let label: () -> MenuLabel

	var body: some View {
		Menu {
			TrackMenuItems.make(viewModel.subtitleMenu) { viewModel.selectSubtitle($0) }
			if viewModel.capabilities.decoderSettings {
				Divider()
				Button {
					viewModel.showSubtitleScaleControl = true
				} label: {
					Label(
						"\(viewModel.str("subtitleSize", "Subtitle size")): \(String(format: "%.1f×", viewModel.subtitleScale))",
						systemImage: "textformat.size"
					)
				}
				.disabled(viewModel.subtitleScaleLocked)
				Menu {
					SyncOffsetEntries.make(current: viewModel.subtitleDelay) { viewModel.setSubtitleDelay($0) }
				} label: {
					Label(viewModel.str("subtitleSync", "Subtitle sync"), systemImage: "clock.arrow.2.circlepath")
				}
			}
			if viewModel.subtitleSearchEnabled {
				Button {
					viewModel.openSubtitleSearch()
				} label: {
					Label(viewModel.str("searchSubtitles", "Search subtitles"), systemImage: "magnifyingglass")
				}
			}
		} label: {
			label()
		}
		.menuOrder(.fixed)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("subtitles", "Subtitles"))
	}
}

/// Picture in picture and zoom when the bar folds them, speed in a compact bar, quality, chapters, sleep timer,
/// rotate, lock and technical info.
struct MoreMenu<MenuLabel: View>: View {
	@ObservedObject var viewModel: PlayerViewModel
	var compact = false
	var foldsPictureInPicture = false
	@ViewBuilder let label: () -> MenuLabel

	var body: some View {
		Menu {
			if foldsPictureInPicture && viewModel.capabilities.pictureInPicture {
				Button {
					viewModel.togglePictureInPicture()
				} label: {
					Label(
						viewModel.str("pictureInPicture", "Picture in picture"),
						systemImage: viewModel.isPipActive ? "pip.exit" : "pip.enter"
					)
				}
			}
			if compact {
				if viewModel.capabilities.zoom {
					Button {
						viewModel.toggleZoomToFill()
					} label: {
						if viewModel.isZoomedToFill {
							Label(viewModel.str("zoomToFill", "Zoom to fill"), systemImage: "checkmark")
						} else {
							Label(viewModel.str("zoomToFill", "Zoom to fill"), systemImage: "arrow.up.left.and.arrow.down.right")
						}
					}
				}
				if !viewModel.isSyncPlayActive && viewModel.capabilities.speed {
					Menu {
						SpeedMenuEntries(viewModel: viewModel)
					} label: {
						Label(viewModel.str("speed", "Speed"), systemImage: "speedometer")
					}
				}
			}
			if !viewModel.qualityMenu.isEmpty {
				QualityMenu(viewModel: viewModel) {
					Label(viewModel.str("quality", "Quality"), systemImage: "slider.horizontal.3")
				}
			}
			if !viewModel.chapters.isEmpty {
				ChaptersMenu(viewModel: viewModel) {
					Label(viewModel.str("chapters", "Chapters"), systemImage: "bookmark")
				}
			}
			if !viewModel.isSyncPlayActive && viewModel.capabilities.sleepTimer { sleepTimerMenu }
			if viewModel.capabilities.rotate {
				Button {
					viewModel.requestRotate()
				} label: {
					Label(viewModel.str("rotate", "Rotate"), systemImage: "rotate.right")
				}
			}
			if viewModel.capabilities.lockControls {
				Button {
					viewModel.lockControls()
				} label: {
					Label(viewModel.str("lockControls", "Lock controls"), systemImage: "lock")
				}
			}
			if viewModel.capabilities.technicalInfo {
				Button {
					viewModel.showTechnicalInfo.toggle()
					viewModel.scheduleAutoHide()
				} label: {
					if viewModel.showTechnicalInfo {
						Label(viewModel.str("technicalInfo", "Technical info"), systemImage: "checkmark")
					} else {
						Label(viewModel.str("technicalInfo", "Technical info"), systemImage: "info.circle")
					}
				}
			}
		} label: {
			label()
		}
		.menuOrder(.fixed)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
	}

	private var sleepTimerMenu: some View {
		Menu {
			if viewModel.sleepTimerMinutes != nil {
				Button {
					viewModel.cancelSleepTimer()
				} label: {
					Label(viewModel.str("sleepTimerOff", "Turn off"), systemImage: "xmark")
				}
				Divider()
			}
			ForEach(PlayerViewModel.sleepTimerPresetMinutes, id: \.self) { minutes in
				Button {
					viewModel.setSleepTimer(minutes: minutes)
				} label: {
					if viewModel.sleepTimerMinutes == minutes {
						Label(sleepTimerLabel(minutes), systemImage: "checkmark")
					} else {
						Text(sleepTimerLabel(minutes))
					}
				}
			}
		} label: {
			Label(
				viewModel.str("sleepTimer", "Sleep timer"),
				systemImage: viewModel.sleepTimerMinutes == nil ? "moon.zzz" : "moon.zzz.fill"
			)
		}
	}

	private func sleepTimerLabel(_ minutes: Int) -> String {
		minutes < 60 ? "\(minutes) min" : String(format: "%g h", Double(minutes) / 60)
	}
}

/// The quality choices.
struct QualityMenu<MenuLabel: View>: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ViewBuilder let label: () -> MenuLabel

	var body: some View {
		Menu {
			TrackMenuItems.make(viewModel.qualityMenu) { viewModel.selectQuality($0) }
		} label: {
			label()
		}
	}
}

/// The chapters, each seeking to its start.
struct ChaptersMenu<MenuLabel: View>: View {
	@ObservedObject var viewModel: PlayerViewModel
	@ViewBuilder let label: () -> MenuLabel

	var body: some View {
		Menu {
			ForEach(Array(viewModel.chapters.enumerated()), id: \.offset) { index, chapter in
				Button {
					viewModel.seek(to: chapter.startSec)
				} label: {
					Text("\(chapter.name ?? "\(index + 1)") — \(formatTime(chapter.startSec))")
				}
			}
		} label: {
			label()
		}
	}
}

// MARK: - Entries shared by several menus

enum SyncOffsetEntries {
	static func make(
		current: Double,
		onSelect: @escaping (Double) -> Void
	) -> some View {
		ForEach(PlayerViewModel.syncOffsetPresets, id: \.self) { offset in
			Button {
				onSelect(offset)
			} label: {
				if abs(current - offset) < 0.001 {
					Label(SyncOffsetEntries.offsetLabel(offset), systemImage: "checkmark")
				} else {
					Text(SyncOffsetEntries.offsetLabel(offset))
				}
			}
		}
	}

	static func offsetLabel(_ offset: Double) -> String {
		offset == 0 ? "0 s" : String(format: "%+g s", offset)
	}
}

enum TrackMenuItems {
	static func make(
		_ items: [TrackMenuItemRecord],
		onSelect: @escaping (TrackMenuItemRecord) -> Void
	) -> some View {
		ForEach(Array(items.enumerated()), id: \.offset) { _, item in
			Button {
				onSelect(item)
			} label: {
				// A menu draws a button's second Text as the row's subtitle.
				if item.selected {
					Label {
						rowText(item)
					} icon: {
						Image(systemName: "checkmark")
					}
				} else {
					rowText(item)
				}
			}
		}
	}

	@ViewBuilder
	private static func rowText(_ item: TrackMenuItemRecord) -> some View {
		Text(item.label)
		if let detail = TrackRowText.detailLine(item.detail) {
			Text(detail)
		}
	}
}

fileprivate func speedLabel(_ speed: Double) -> String {
	speed == 1.0 ? "1×" : String(format: "%g×", speed)
}
#endif
