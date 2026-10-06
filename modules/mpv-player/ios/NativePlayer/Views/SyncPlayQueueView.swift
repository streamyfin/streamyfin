import SwiftUI

/// Native controls render server-owned queue/modes. Taps are requests to the
/// shared Jellyfin coordinator; this sheet never changes the decoder locally.
@available(tvOS 17.0, *)
struct SyncPlayQueueView: View {
	@ObservedObject var viewModel: PlayerViewModel
	/// The order a drag left on screen, until the server's answer replaces it.
	@State private var draggedOrder: [String]?

	private func text(_ key: String, _ fallback: String) -> String {
		viewModel.syncStr(key, fallback)
	}
	private var unavailable: Bool {
		#if os(tvOS)
		// Disabling a focused control drops TV focus during every request.
		return viewModel.syncPlay?.connected != true
		#else
		return viewModel.syncPlay?.connected != true || viewModel.syncPlay?.busy == true
		#endif
	}

	/// Disabled state of a control whose availability follows the queue
	/// (previous and next at the ends, clear on an empty queue). On tvOS the
	/// queue changes under the focused control, often because of its own
	/// press, and a disabled control hands its focus to a neighbour: there it
	/// stays focusable, dims, and its action checks the same condition.
	private func gated(_ capable: Bool) -> Bool {
		#if os(tvOS)
		return unavailable
		#else
		return unavailable || !capable
		#endif
	}

	private func gatedOpacity(_ capable: Bool) -> Double {
		#if os(tvOS)
		return capable ? 1 : 0.4
		#else
		return 1
		#endif
	}

	private func requestAction(_ action: String, _ fields: [String: Any] = [:]) {
		#if os(tvOS)
		guard viewModel.syncPlay?.busy != true else { return }
		#endif
		viewModel.syncPlayAction(action, fields)
	}

	var body: some View {
		NavigationView {
			Form {
				if let state = viewModel.syncPlay {
					Section {
						Text(state.groupName).font(.headline)
						Text(state.connected ? state.status : text("reconnecting", "Reconnecting"))
							.foregroundStyle(.secondary)
						if let error = state.error { Text(error).foregroundStyle(.red) }
						HStack {
							Button { if state.hasPrevious { requestAction("previous") } } label: {
								Label(text("previous", "Previous"), systemImage: "backward.end.fill")
							}.disabled(gated(state.hasPrevious)).opacity(gatedOpacity(state.hasPrevious))
							Button { requestAction(viewModel.isPlaying ? "pause" : "play") } label: {
								Label(text(viewModel.isPlaying ? "pause" : "play", viewModel.isPlaying ? "Pause" : "Play"),
									systemImage: viewModel.isPlaying ? "pause.fill" : "play.fill")
							}.disabled(unavailable)
							Button { if state.hasNext { requestAction("next") } } label: {
								Label(text("next", "Next"), systemImage: "forward.end.fill")
							}.disabled(gated(state.hasNext)).opacity(gatedOpacity(state.hasNext))
						}.buttonStyle(.borderless)
					} header: { Text(text("title", "SyncPlay")) }

					Section {
						#if os(tvOS)
						Menu {
							ForEach(["RepeatNone", "RepeatAll", "RepeatOne"], id: \.self) { mode in
								Button { requestAction("repeat", ["mode": mode]) } label: {
									if mode == state.repeatMode {
										Label(text("repeat_modes_\(mode)", mode == "RepeatNone" ? "Off" : mode == "RepeatAll" ? "All" : "One"), systemImage: "checkmark")
									} else {
										Text(text("repeat_modes_\(mode)", mode == "RepeatNone" ? "Off" : mode == "RepeatAll" ? "All" : "One"))
									}
								}.accessibilityIdentifier("syncplay-repeat-\(mode)")
							}
						} label: {
							HStack {
								Text(text("repeat", "Repeat"))
								Spacer()
								Text(text("repeat_modes_\(state.repeatMode)", state.repeatMode == "RepeatNone" ? "Off" : state.repeatMode == "RepeatAll" ? "All" : "One"))
									.foregroundStyle(.secondary)
							}
						}
						.menuOrder(.fixed)
						.accessibilityIdentifier("syncplay-repeat")
						#else
						Picker(text("repeat", "Repeat"), selection: Binding(
							get: { viewModel.syncPlay?.repeatMode ?? "RepeatNone" },
							set: { requestAction("repeat", ["mode": $0]) })) {
							ForEach(["RepeatNone", "RepeatAll", "RepeatOne"], id: \.self) { mode in
								Text(text("repeat_modes_\(mode)", mode == "RepeatNone" ? "Off" : mode == "RepeatAll" ? "All" : "One")).tag(mode)
							}
						}.accessibilityIdentifier("syncplay-repeat")
						#endif
						Toggle(text("shuffle", "Shuffle"), isOn: Binding(
							get: { viewModel.syncPlay?.shuffleMode == "Shuffle" },
							set: { requestAction("shuffle", ["mode": $0 ? "Shuffle" : "Sorted"]) }))
							.accessibilityIdentifier("syncplay-shuffle")
						Toggle(text("ignore_wait", "Ignore waiting"), isOn: Binding(
							get: { viewModel.syncPlay?.ignoreWait == true },
							set: { requestAction("ignoreWait", ["value": $0]) }))
							.accessibilityIdentifier("syncplay-ignore-wait")
						Text(text("ignore_wait_hint", "Other participants can continue while this device buffers."))
							.font(.caption).foregroundStyle(.secondary)
					} header: { Text(text("playback_options", "Playback options")) }
					.disabled(unavailable)

					Section {
						if state.playlist.isEmpty { Text(text("empty_queue", "The queue is empty")) }
						let entries = ordered(state.playlist)
						#if os(iOS)
						ForEach(entries, id: \.playlistItemId) { item in
							Button { requestAction("select", ["playlistItemId": item.playlistItemId]) } label: {
								queueLabel(item, current: item.playlistItemId == state.currentPlaylistItemId, handle: true)
							}
							.buttonStyle(.plain)
							.disabled(unavailable)
							.accessibilityIdentifier("syncplay-queue-item-\(item.playlistItemId)")
						}
						.onMove { source, destination in move(entries, from: source, to: destination) }
						.onDelete { offsets in
							for index in offsets { requestAction("remove", ["playlistItemId": entries[index].playlistItemId]) }
						}
						.moveDisabled(unavailable)
						.deleteDisabled(unavailable)
						#else
						ForEach(Array(entries.enumerated()), id: \.element.playlistItemId) { index, item in
							queueRow(item, index: index, count: entries.count)
						}
						#endif
						Button(text("clear_upcoming", "Clear upcoming")) {
							if !state.playlist.isEmpty { requestAction("clear", ["value": false]) }
						}
							.disabled(gated(!state.playlist.isEmpty)).opacity(gatedOpacity(!state.playlist.isEmpty))
						Button(text("clear_all", "Clear all"), role: .destructive) {
							if !state.playlist.isEmpty { requestAction("clear", ["value": true]) }
						}
							.disabled(gated(!state.playlist.isEmpty)).opacity(gatedOpacity(!state.playlist.isEmpty))
					} header: { Text(text("queue", "Queue")) }

					Section {
						Button(text("refresh_group", "Refresh group")) { viewModel.syncPlayAction("refresh") }.disabled(unavailable)
						Button(text("stop", "Stop"), role: .destructive) { requestAction("stop") }.disabled(unavailable)
						Button(text("leave", "Leave group"), role: .destructive) {
							viewModel.syncPlayAction("leave")
							viewModel.closeSyncPlayQueue()
						}
					}
				}
			}
			.navigationTitle(text("queue", "Queue"))
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button(text("close", "Close")) { viewModel.closeSyncPlayQueue() }
				}
			}
		}
		// Whatever the server says replaces the order a drag left on screen.
		.onChange(of: viewModel.syncPlay?.playlist.map(\.playlistItemId) ?? []) { _ in draggedOrder = nil }
		.preferredColorScheme(.dark)
		#if os(tvOS)
		.onExitCommand { viewModel.closeSyncPlayQueue() }
		#endif
	}

	private func ordered(_ playlist: [SyncPlayPlaylistItemRecord]) -> [SyncPlayPlaylistItemRecord] {
		guard let draggedOrder, draggedOrder.count == playlist.count else { return playlist }
		let byId = Dictionary(playlist.map { ($0.playlistItemId, $0) }, uniquingKeysWith: { first, _ in first })
		let moved = draggedOrder.compactMap { byId[$0] }
		return moved.count == playlist.count ? moved : playlist
	}

	#if os(iOS)
	/// The server owns the order: a drag is a request, shown at once and
	/// corrected by the answer.
	private func move(_ entries: [SyncPlayPlaylistItemRecord], from source: IndexSet, to destination: Int) {
		guard let from = source.first else { return }
		// SwiftUI counts the destination with the row still in place.
		let to = destination > from ? destination - 1 : destination
		guard to != from else { return }
		var order = entries.map(\.playlistItemId)
		order.insert(order.remove(at: from), at: to)
		draggedOrder = order
		requestAction("move", ["playlistItemId": entries[from].playlistItemId, "newIndex": to])
		// A refused move sends no queue update to put the row back.
		DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
			if draggedOrder == order { draggedOrder = nil }
		}
	}
	#endif

	/// Poster, title and what the entry belongs to: the music queue's row.
	private func queueLabel(_ item: SyncPlayPlaylistItemRecord, current: Bool, handle: Bool) -> some View {
		HStack(spacing: 12) {
			if handle {
				Image(systemName: "line.3.horizontal").foregroundStyle(.secondary)
			}
			poster(item)
				.frame(width: 40, height: 60)
				.clipShape(RoundedRectangle(cornerRadius: 4))
			VStack(alignment: .leading, spacing: 2) {
				Text(item.title)
					.lineLimit(1)
					.fontWeight(current ? .semibold : .regular)
					.foregroundStyle(current ? Color.purple : Color.primary)
				if let subtitle = item.subtitle, !subtitle.isEmpty {
					Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
				}
			}
			Spacer(minLength: 0)
			if current {
				Image(systemName: "film").foregroundStyle(Color.purple)
					.accessibilityLabel(text("now_playing", "Now playing"))
			}
		}
		.contentShape(Rectangle())
	}

	@ViewBuilder
	private func poster(_ item: SyncPlayPlaylistItemRecord) -> some View {
		if let imageUrl = item.imageUrl, let url = URL(string: imageUrl) {
			RemoteImage(url: url, headers: viewModel.imageHeaders) { Color.gray.opacity(0.3) }
		} else {
			ZStack {
				Color.gray.opacity(0.3)
				Image(systemName: "film").foregroundStyle(.secondary)
			}
		}
	}

	#if os(tvOS)
	// A remote cannot drag: the same row, with its actions in a menu.
	private func queueRow(_ item: SyncPlayPlaylistItemRecord, index: Int, count: Int) -> some View {
		Menu {
			Button(text("play_now", "Play now")) { requestAction("select", ["playlistItemId": item.playlistItemId]) }
			Button(text("move_up", "Move up")) {
				requestAction("move", ["playlistItemId": item.playlistItemId, "newIndex": index - 1])
			}.disabled(index == 0)
			Button(text("move_down", "Move down")) {
				requestAction("move", ["playlistItemId": item.playlistItemId, "newIndex": index + 1])
			}.disabled(index == count - 1)
			Button(text("remove", "Remove"), role: .destructive) { requestAction("remove", ["playlistItemId": item.playlistItemId]) }
		} label: {
			queueLabel(item, current: item.playlistItemId == viewModel.syncPlay?.currentPlaylistItemId, handle: false)
		}
		.disabled(unavailable)
		.accessibilityIdentifier("syncplay-queue-item-\(index)")
	}
	#endif
}
