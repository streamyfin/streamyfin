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
			}
			.padding(.leading, 8)

			Spacer(minLength: 12)

			if viewModel.engine?.isPictureInPictureSupported() == true {
				barButton(systemName: viewModel.isPipActive ? "pip.exit" : "pip.enter") {
					viewModel.togglePictureInPicture()
				}
			}

			if !compact {
				barButton(
					systemName: viewModel.isZoomedToFill
						? "arrow.down.right.and.arrow.up.left"
						: "arrow.up.left.and.arrow.down.right"
				) {
					viewModel.toggleZoomToFill()
				}
			}

			if !viewModel.episodeList.isEmpty {
				barButton(systemName: "list.bullet") {
					viewModel.showEpisodeList = true
					viewModel.scheduleAutoHide()
				}
				.accessibilityLabel(viewModel.str("episodes", "Episodes"))
			}

			if !compact {
				speedMenu
			}

			if !viewModel.audioMenu.isEmpty {
				audioTracksMenu
			}

			if !viewModel.subtitleMenu.isEmpty {
				subtitlesMenu
			}

			moreMenu
		}
	}

	// MARK: - Menus

	private var speedMenu: some View {
		Menu {
			speedMenuEntries
		} label: {
			barIcon(systemName: "speedometer")
		}
		.menuOrder(.fixed)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("speed", "Speed"))
	}

	private var speedMenuEntries: some View {
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

	/// Audio track picker plus a nested sync-offset submenu (mpv audio-delay).
	private var audioTracksMenu: some View {
		Menu {
			trackMenuItems(viewModel.audioMenu) { viewModel.selectAudio($0) }
			Divider()
			Menu {
				syncOffsetEntries(current: viewModel.audioDelay) { viewModel.setAudioDelay($0) }
			} label: {
				Label(viewModel.str("audioSync", "Audio sync"), systemImage: "clock.arrow.2.circlepath")
			}
		} label: {
			barIcon(systemName: "waveform")
		}
		.menuOrder(.fixed)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("audio", "Audio"))
	}

	private func syncOffsetEntries(
		current: Double,
		onSelect: @escaping (Double) -> Void
	) -> some View {
		ForEach(PlayerViewModel.syncOffsetPresets, id: \.self) { offset in
			Button {
				onSelect(offset)
			} label: {
				if abs(current - offset) < 0.001 {
					Label(offsetLabel(offset), systemImage: "checkmark")
				} else {
					Text(offsetLabel(offset))
				}
			}
		}
	}

	private func offsetLabel(_ offset: Double) -> String {
		offset == 0 ? "0 s" : String(format: "%+g s", offset)
	}

	private func trackMenuItems(
		_ items: [TrackMenuItemRecord],
		onSelect: @escaping (TrackMenuItemRecord) -> Void
	) -> some View {
		ForEach(Array(items.enumerated()), id: \.offset) { _, item in
			Button {
				onSelect(item)
			} label: {
				if item.selected {
					Label(item.label, systemImage: "checkmark")
				} else {
					Text(item.label)
				}
			}
		}
	}

	/// Subtitle track picker plus the shared subtitle-size control.
	private var subtitlesMenu: some View {
		Menu {
			trackMenuItems(viewModel.subtitleMenu) { viewModel.selectSubtitle($0) }
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
				syncOffsetEntries(current: viewModel.subtitleDelay) { viewModel.setSubtitleDelay($0) }
			} label: {
				Label(viewModel.str("subtitleSync", "Subtitle sync"), systemImage: "clock.arrow.2.circlepath")
			}
		} label: {
			barIcon(systemName: "captions.bubble")
		}
		.menuOrder(.fixed)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
		.accessibilityLabel(viewModel.str("subtitles", "Subtitles"))
	}

	private var moreMenu: some View {
		Menu {
			if compact {
				Button {
					viewModel.toggleZoomToFill()
				} label: {
					if viewModel.isZoomedToFill {
						Label(viewModel.str("zoomToFill", "Zoom to fill"), systemImage: "checkmark")
					} else {
						Label(viewModel.str("zoomToFill", "Zoom to fill"), systemImage: "arrow.up.left.and.arrow.down.right")
					}
				}
				Menu {
					speedMenuEntries
				} label: {
					Label(viewModel.str("speed", "Speed"), systemImage: "speedometer")
				}
			}
			if !viewModel.qualityMenu.isEmpty {
				Menu {
					trackMenuItems(viewModel.qualityMenu) { viewModel.selectQuality($0) }
				} label: {
					Label(viewModel.str("quality", "Quality"), systemImage: "slider.horizontal.3")
				}
			}
			if !viewModel.chapters.isEmpty {
				Menu {
					ForEach(Array(viewModel.chapters.enumerated()), id: \.offset) { index, chapter in
						Button {
							viewModel.seek(to: chapter.startSec)
						} label: {
							Text("\(chapter.name ?? "\(index + 1)") — \(formatTime(chapter.startSec))")
						}
					}
				} label: {
					Label(viewModel.str("chapters", "Chapters"), systemImage: "bookmark")
				}
			}
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
			sleepTimerMenu
			Button {
				viewModel.requestRotate()
			} label: {
				Label(viewModel.str("rotate", "Rotate"), systemImage: "rotate.right")
			}
			Button {
				viewModel.lockControls()
			} label: {
				Label(viewModel.str("lockControls", "Lock controls"), systemImage: "lock")
			}
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
		} label: {
			barIcon(systemName: "ellipsis.circle")
		}
		.menuOrder(.fixed)
		.simultaneousGesture(TapGesture().onEnded { viewModel.menuInteractionStarted() })
	}

	/// When the timer fires the player dismisses fully, so the idle timer
	/// re-enables and the phone auto-locks on its own.
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

	private func speedLabel(_ speed: Double) -> String {
		speed == 1.0 ? "1×" : String(format: "%g×", speed)
	}

	private func boostLabel(_ percent: Int) -> String {
		percent == 100 ? viewModel.str("off", "Off") : "\(percent)%"
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
#endif
