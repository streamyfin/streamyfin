import SwiftUI

/// Native controls render server-owned queue/modes. Taps are requests to the
/// shared Jellyfin coordinator; this sheet never changes the decoder locally.
struct SyncPlayQueueView: View {
	@ObservedObject var viewModel: PlayerViewModel
	@State private var query = ""

	private func text(_ key: String, _ fallback: String) -> String {
		viewModel.syncStr(key, fallback)
	}
	private var unavailable: Bool { viewModel.syncPlay?.connected != true || viewModel.syncPlay?.busy == true }

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
							Button { viewModel.syncPlayAction("previous") } label: {
								Label(text("previous", "Previous"), systemImage: "backward.end.fill")
							}.disabled(unavailable || !state.hasPrevious)
							Button { viewModel.syncPlayAction(viewModel.isPlaying ? "pause" : "play") } label: {
								Label(text(viewModel.isPlaying ? "pause" : "play", viewModel.isPlaying ? "Pause" : "Play"),
									systemImage: viewModel.isPlaying ? "pause.fill" : "play.fill")
							}.disabled(unavailable)
							Button { viewModel.syncPlayAction("next") } label: {
								Label(text("next", "Next"), systemImage: "forward.end.fill")
							}.disabled(unavailable || !state.hasNext)
						}.buttonStyle(.borderless)
					} header: { Text(text("title", "SyncPlay")) }

					Section {
						Picker(text("repeat", "Repeat"), selection: Binding(
							get: { viewModel.syncPlay?.repeatMode ?? "RepeatNone" },
							set: { viewModel.syncPlayAction("repeat", ["mode": $0]) })) {
							ForEach(["RepeatNone", "RepeatAll", "RepeatOne"], id: \.self) { mode in
								Text(text("repeat_modes_\(mode)", mode == "RepeatNone" ? "Off" : mode == "RepeatAll" ? "All" : "One")).tag(mode)
							}
						}.accessibilityIdentifier("syncplay-repeat")
						Toggle(text("shuffle", "Shuffle"), isOn: Binding(
							get: { viewModel.syncPlay?.shuffleMode == "Shuffle" },
							set: { viewModel.syncPlayAction("shuffle", ["mode": $0 ? "Shuffle" : "Sorted"]) }))
							.accessibilityIdentifier("syncplay-shuffle")
						Toggle(text("ignore_wait", "Ignore waiting"), isOn: Binding(
							get: { viewModel.syncPlay?.ignoreWait == true },
							set: { viewModel.syncPlayAction("ignoreWait", ["value": $0]) }))
							.accessibilityIdentifier("syncplay-ignore-wait")
						Text(text("ignore_wait_hint", "Other participants can continue while this device buffers."))
							.font(.caption).foregroundStyle(.secondary)
					} header: { Text(text("playback_options", "Playback options")) }
					.disabled(unavailable)

					Section {
						if state.playlist.isEmpty { Text(text("empty_queue", "The queue is empty")) }
						ForEach(Array(state.playlist.enumerated()), id: \.element.playlistItemId) { index, item in
							queueRow(item, index: index, count: state.playlist.count)
						}
						Button(text("clear_upcoming", "Clear upcoming")) { viewModel.syncPlayAction("clear", ["value": false]) }
							.disabled(unavailable || state.playlist.isEmpty)
						Button(text("clear_all", "Clear all"), role: .destructive) { viewModel.syncPlayAction("clear", ["value": true]) }
							.disabled(unavailable || state.playlist.isEmpty)
					} header: { Text(text("queue", "Queue")) }

					Section {
						TextField(text("search_videos", "Search videos"), text: $query)
							.accessibilityIdentifier("syncplay-search")
							.onChange(of: query) { value in viewModel.syncPlayAction("search", ["query": value]) }
						if state.libraryLoading { ProgressView() }
						else if state.library.isEmpty { Text(text("no_videos", "No videos found")).foregroundStyle(.secondary) }
						ForEach(state.library, id: \.itemId) { item in
							Menu {
								Button(text("play_now", "Play now")) { viewModel.syncPlayAction("playItems", ["itemIds": [item.itemId]]) }
								Button(text("play_next", "Play next")) { viewModel.syncPlayAction("queue", ["itemIds": [item.itemId], "mode": "QueueNext"]) }
								Button(text("append", "Append")) { viewModel.syncPlayAction("queue", ["itemIds": [item.itemId], "mode": "Queue"]) }
							} label: { Label(item.title, systemImage: "plus.circle") }
							.disabled(unavailable)
						}
					} header: { Text(text("add_videos", "Add videos")) }

					Section {
						Button(text("refresh_group", "Refresh group")) { viewModel.syncPlayAction("refresh") }.disabled(unavailable)
						Button(text("stop", "Stop"), role: .destructive) { viewModel.syncPlayAction("stop") }.disabled(unavailable)
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
		.onAppear { query = viewModel.syncPlay?.libraryQuery ?? "" }
		.preferredColorScheme(.dark)
		#if os(tvOS)
		.onExitCommand { viewModel.closeSyncPlayQueue() }
		#endif
	}

	private func queueRow(_ item: SyncPlayPlaylistItemRecord, index: Int, count: Int) -> some View {
		Menu {
			Button(text("play_now", "Play now")) { viewModel.syncPlayAction("select", ["playlistItemId": item.playlistItemId]) }
			Button(text("move_up", "Move up")) {
				viewModel.syncPlayAction("move", ["playlistItemId": item.playlistItemId, "newIndex": index - 1])
			}.disabled(index == 0)
			Button(text("move_down", "Move down")) {
				viewModel.syncPlayAction("move", ["playlistItemId": item.playlistItemId, "newIndex": index + 1])
			}.disabled(index == count - 1)
			Button(text("remove", "Remove"), role: .destructive) { viewModel.syncPlayAction("remove", ["playlistItemId": item.playlistItemId]) }
		} label: {
			VStack(alignment: .leading) {
				Text(item.title)
				if item.playlistItemId == viewModel.syncPlay?.currentPlaylistItemId {
					Text(text("now_playing", "Now playing")).font(.caption).foregroundStyle(.secondary)
				}
			}
		}
		.disabled(unavailable)
		.accessibilityIdentifier("syncplay-queue-item-\(index)")
	}
}
