#if os(tvOS)
import SwiftUI

/// The group's queue and modes in the TV player — the counterpart of the iOS
/// SyncPlayQueueView sheet, as a focus panel like TVSubtitleSearchPanel. The
/// chrome hides first, so the panel's buttons are the only focusable content
/// while it is up. Presses are requests to the shared Jellyfin coordinator in
/// JS: nothing here changes the decoder.
@available(tvOS 26.0, *)
struct TVSyncPlayPanel: View {
	/// Queue entries are named by their id, not their index: a moved entry
	/// keeps the focus it was moved with.
	private enum PanelFocus: Hashable {
		case entry(String)
		case clearUpcoming, clearAll
		case repeatMode, shuffle, ignoreWait
		case stop, leave
	}

	private static let repeatModes = ["RepeatNone", "RepeatAll", "RepeatOne"]

	@ObservedObject var viewModel: PlayerViewModel
	let focusCoordinator: TVFocusCoordinator
	@FocusState private var focused: PanelFocus?
	/// See TVControlsRow.focusGate: the panel opens on the entry that is
	/// playing, which is rarely the top-left control the engine would pick.
	@State private var focusGate: PanelFocus?

	private func text(_ key: String, _ fallback: String) -> String {
		viewModel.syncStr(key, fallback)
	}

	/// Nothing here is ever disabled: a disabled control hands its focus to
	/// a neighbour, and the state under these changes on every request,
	/// often because of the control's own press. What cannot act right now
	/// dims and ignores the press.
	private func request(
		_ action: String, _ fields: [String: Any] = [:], when capable: Bool = true
	) {
		guard capable, viewModel.syncPlay?.connected == true,
			viewModel.syncPlay?.busy != true
		else { return }
		viewModel.syncPlayAction(action, fields)
	}

	private func dim(_ capable: Bool) -> Double {
		capable && viewModel.syncPlay?.connected == true ? 1 : 0.4
	}

	private var defaultTarget: PanelFocus {
		guard let state = viewModel.syncPlay, let first = state.playlist.first else {
			return .repeatMode
		}
		let current = state.playlist.first {
			$0.playlistItemId == state.currentPlaylistItemId
		}
		return .entry((current ?? first).playlistItemId)
	}

	var body: some View {
		ZStack {
			// A modal moment, as the subtitle search: dim the video so the
			// panel reads as the only interactive surface.
			Color.black.opacity(0.6).ignoresSafeArea()
			if let state = viewModel.syncPlay {
				VStack(alignment: .leading, spacing: 28) {
					header(state)
					HStack(alignment: .top, spacing: 40) {
						queue(state)
							.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
							.focusSection()
						options(state)
							.frame(width: 460)
							.frame(maxHeight: .infinity, alignment: .top)
							.focusSection()
					}
				}
				.padding(44)
				.frame(width: 1400, height: 840)
				.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 24))
			}
		}
		// Backup for the VC's always-live Menu recognizer — whichever fires,
		// closing twice is harmless.
		.onExitCommand { viewModel.closeSyncPlayQueue() }
		.onChange(of: focused) { newValue in
			// Focus landed: let the rest of the panel back in.
			if newValue != nil { focusGate = nil }
		}
		.tvFocusZone(
			.syncPlay, coordinator: focusCoordinator, focus: $focused,
			gate: $focusGate, target: { defaultTarget })
	}

	private func header(_ state: SyncPlayStateRecord) -> some View {
		VStack(alignment: .leading, spacing: 6) {
			Text(state.groupName)
				.font(.title3.weight(.semibold))
				.foregroundStyle(.white)
				.lineLimit(1)
			Text(state.connected ? state.status : text("reconnecting", "Reconnecting"))
				.font(.callout)
				.foregroundStyle(.white.opacity(0.7))
			if let error = state.error {
				Text(error)
					.font(.callout)
					.foregroundStyle(.orange)
					.lineLimit(2)
			}
		}
	}

	// MARK: - Queue

	private func queue(_ state: SyncPlayStateRecord) -> some View {
		VStack(alignment: .leading, spacing: 12) {
			sectionTitle(text("queue", "Shared queue"))
			if state.playlist.isEmpty {
				Text(text("empty_queue", "The queue is empty"))
					.font(.system(size: 24))
					.foregroundStyle(.white.opacity(0.7))
					.frame(maxWidth: .infinity, maxHeight: .infinity)
			} else {
				ScrollView {
					LazyVStack(spacing: 14) {
						ForEach(
							Array(state.playlist.enumerated()), id: \.element.playlistItemId
						) { index, item in
							entryRow(
								item, index: index, count: state.playlist.count,
								current: item.playlistItemId == state.currentPlaylistItemId)
						}
					}
					// Headroom for the focus scale so rows don't clip at the
					// scroll edges.
					.padding(.vertical, 16)
					.padding(.horizontal, 8)
				}
			}
			HStack(spacing: 14) {
				actionButton(
					.clearUpcoming, text("clear_upcoming", "Keep current video only"),
					capable: !state.playlist.isEmpty
				) {
					request("clear", ["value": false], when: !state.playlist.isEmpty)
				}
				actionButton(
					.clearAll, text("clear_all", "Clear queue and stop"),
					role: .destructive, capable: !state.playlist.isEmpty
				) {
					request("clear", ["value": true], when: !state.playlist.isEmpty)
				}
			}
			.padding(.horizontal, 8)
		}
	}

	/// A remote cannot drag: the entry opens a menu with what a drag, a swipe
	/// and a tap do on the phone.
	private func entryRow(
		_ item: SyncPlayPlaylistItemRecord, index: Int, count: Int, current: Bool
	) -> some View {
		let id = item.playlistItemId
		return Menu {
			Button(text("play_now", "Play now")) {
				request("select", ["playlistItemId": id])
			}
			Button(text("move_up", "Move up")) {
				request("move", ["playlistItemId": id, "newIndex": index - 1])
			}.disabled(index == 0)
			Button(text("move_down", "Move down")) {
				request("move", ["playlistItemId": id, "newIndex": index + 1])
			}.disabled(index == count - 1)
			Button(text("remove", "Remove"), role: .destructive) {
				request("remove", ["playlistItemId": id])
			}
		} label: {
			HStack(spacing: 20) {
				poster(item)
					.frame(width: 60, height: 90)
					.clipShape(RoundedRectangle(cornerRadius: 6))
				VStack(alignment: .leading, spacing: 6) {
					Text(item.title)
						.font(.system(size: 26, weight: current ? .semibold : .medium))
						.lineLimit(1)
					if let subtitle = item.subtitle, !subtitle.isEmpty {
						Text(subtitle)
							.font(.system(size: 20))
							.opacity(0.7)
							.lineLimit(1)
					}
				}
				Spacer(minLength: 0)
				if current {
					Label(text("now_playing", "Current video"), systemImage: "play.fill")
						.font(.system(size: 20, weight: .semibold))
						.opacity(0.7)
				}
			}
			.frame(maxWidth: .infinity, alignment: .leading)
			.padding(.vertical, 6)
		}
		.menuOrder(.fixed)
		.buttonStyle(.glass)
		.opacity(dim(true))
		.focused($focused, equals: .entry(id))
		.tvFocusGated(focusGate, PanelFocus.entry(id))
		.accessibilityIdentifier("syncplay-queue-item-\(index)")
	}

	@ViewBuilder
	private func poster(_ item: SyncPlayPlaylistItemRecord) -> some View {
		if let imageUrl = item.imageUrl, let url = URL(string: imageUrl) {
			RemoteImage(url: url, headers: viewModel.imageHeaders) {
				Color.white.opacity(0.1)
			}
		} else {
			ZStack {
				Color.white.opacity(0.1)
				Image(systemName: "film").opacity(0.6)
			}
		}
	}

	// MARK: - Modes and group

	private func options(_ state: SyncPlayStateRecord) -> some View {
		let shuffled = state.shuffleMode == "Shuffle"
		return VStack(alignment: .leading, spacing: 14) {
			sectionTitle(text("playback_options", "Playback options"))
			repeatMenu(state)
			valueButton(
				.shuffle, "shuffle", text("shuffle", "Shuffle"), on: shuffled
			) {
				request("shuffle", ["mode": shuffled ? "Sorted" : "Shuffle"])
			}
			valueButton(
				.ignoreWait, "hourglass", text("ignore_wait", "Don't wait for this device"),
				on: state.ignoreWait
			) {
				request("ignoreWait", ["value": !state.ignoreWait])
			}
			Spacer(minLength: 20)
			actionButton(.stop, text("stop", "Stop playback"), role: .destructive) {
				request("stop")
			}
			// Leaving works without the server: it is what a member who lost
			// it wants to do.
			Button(role: .destructive) {
				viewModel.syncPlayAction("leave")
				viewModel.closeSyncPlayQueue()
			} label: {
				rowLabel(text("leave", "Leave group"))
			}
			.buttonStyle(.glass)
			.focused($focused, equals: .leave)
			.tvFocusGated(focusGate, PanelFocus.leave)
			.accessibilityIdentifier("syncplay-leave")
		}
		.padding(.horizontal, 8)
	}

	private func repeatMenu(_ state: SyncPlayStateRecord) -> some View {
		Menu {
			ForEach(Self.repeatModes, id: \.self) { mode in
				Button {
					request("repeat", ["mode": mode])
				} label: {
					if mode == state.repeatMode {
						Label(repeatName(mode), systemImage: "checkmark")
					} else {
						Text(repeatName(mode))
					}
				}
			}
		} label: {
			rowLabel(
				text("repeat", "Repeat"), systemImage: "repeat",
				value: repeatName(state.repeatMode))
		}
		.menuOrder(.fixed)
		.buttonStyle(.glass)
		.opacity(dim(true))
		.focused($focused, equals: .repeatMode)
		.tvFocusGated(focusGate, PanelFocus.repeatMode)
		.accessibilityIdentifier("syncplay-repeat")
	}

	private func repeatName(_ mode: String) -> String {
		text(
			"repeat_modes_\(mode)",
			mode == "RepeatNone" ? "Off" : mode == "RepeatAll" ? "All" : "One")
	}

	// MARK: - Pieces

	private func sectionTitle(_ title: String) -> some View {
		Text(title)
			.font(.system(size: 22, weight: .semibold))
			.foregroundStyle(.white.opacity(0.6))
			.padding(.horizontal, 8)
	}

	/// What every row of the right column and the buttons under the queue
	/// show. No colour of its own: the glass style owns it, dark on the
	/// focused platter and light at rest.
	private func rowLabel(
		_ title: String, systemImage: String? = nil, value: String? = nil
	) -> some View {
		HStack(spacing: 14) {
			if let systemImage {
				Image(systemName: systemImage).frame(width: 34)
			}
			Text(title).lineLimit(1)
			Spacer(minLength: 8)
			if let value {
				Text(value).opacity(0.7).lineLimit(1)
			}
		}
		.font(.system(size: 24, weight: .medium))
		.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
	}

	/// A mode that is on or off: a remote has nothing to flick, so the row
	/// is a button that says where it stands.
	private func valueButton(
		_ id: PanelFocus, _ systemImage: String, _ title: String, on: Bool,
		action: @escaping () -> Void
	) -> some View {
		Button(action: action) {
			rowLabel(
				title, systemImage: systemImage,
				value: text(on ? "on" : "off", on ? "On" : "Off"))
		}
		.buttonStyle(.glass)
		.opacity(dim(true))
		.focused($focused, equals: id)
		.tvFocusGated(focusGate, id)
	}

	private func actionButton(
		_ id: PanelFocus, _ title: String, role: ButtonRole? = nil,
		capable: Bool = true, action: @escaping () -> Void
	) -> some View {
		Button(role: role, action: action) {
			rowLabel(title)
		}
		.buttonStyle(.glass)
		.opacity(dim(capable))
		.focused($focused, equals: id)
		.tvFocusGated(focusGate, id)
	}
}
#endif
