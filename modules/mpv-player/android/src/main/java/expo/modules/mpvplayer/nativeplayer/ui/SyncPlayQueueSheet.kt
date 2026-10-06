package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.syncPlayQueueActionAllowed
import expo.modules.mpvplayer.nativeplayer.syncPlayQueueControlEnabled
import expo.modules.mpvplayer.nativeplayer.syncPlayQueueGatedControlEnabled
import kotlinx.coroutines.delay

/**
 * The group's queue and modes inside the player. A phone gets the sheet the
 * iOS player shows (SyncPlayQueueView.swift): grouped rows, drag to reorder.
 * A remote cannot drag or flick a switch, so the TV chrome keeps a dialog of
 * buttons.
 */
@Composable
fun SyncPlayQueueSheet(viewModel: PlayerViewModel) {
    if (viewModel.isTvChrome) SyncPlayQueueTvDialog(viewModel) else SyncPlayQueuePhoneSheet(viewModel)
}

@Composable
private fun SyncPlayQueueTvDialog(viewModel: PlayerViewModel) {
    val state = viewModel.syncPlay ?: return
    // A temporary request must not remove the focused TV node. Capability
    // restrictions still disable unavailable controls; busy actions are ignored
    // below while the originating control stays focused.
    val enabled = syncPlayQueueControlEnabled(state.connected, state.busy, viewModel.isTvChrome)
    val leaveEnabled = syncPlayQueueControlEnabled(true, state.busy, viewModel.isTvChrome)
    fun gated(capable: Boolean) = syncPlayQueueGatedControlEnabled(enabled, capable, viewModel.isTvChrome)
    val closeFocus = remember { FocusRequester() }
    fun label(key: String, fallback: String) = viewModel.syncStr(key, fallback)
    fun action(name: String, vararg details: Pair<String, Any?>) {
        val current = viewModel.syncPlay ?: return
        if (syncPlayQueueActionAllowed(current.connected || name == "leave", current.busy)) {
            viewModel.syncPlayAction(name, mapOf(*details))
        }
    }

    LaunchedEffect(Unit) {
        // Throws when the dialog content is not attached yet after the delay.
        if (viewModel.isTvChrome) { delay(40); runCatching { closeFocus.requestFocus() } }
    }

    Dialog(
        onDismissRequest = { viewModel.closeSyncPlayQueue() },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .widthIn(max = 760.dp)
                .fillMaxWidth(0.94f)
                .fillMaxHeight(0.9f)
                .semantics { testTagsAsResourceId = true }
                .testTag("syncplay-native-queue"),
            shape = RoundedCornerShape(16.dp),
            color = Color(0xFF171717),
            contentColor = Color.White
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(state.groupName, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text(
                            if (state.connected) state.status else label("reconnecting", "Reconnecting"),
                            color = Color.LightGray,
                            fontSize = 13.sp
                        )
                    }
                    SyncActionButton(
                        label("close", "Close"), "syncplay-native-close", true,
                        Modifier.focusRequester(closeFocus)
                    ) { viewModel.closeSyncPlayQueue() }
                }
                // An explicit bounded scrolling region keeps the clear controls
                // reachable on short landscape phone screens.
                // The fixed sections carry keys: keyed by position, a queue edit
                // would recreate every section below it and drop TV focus.
                LazyColumn(
                    Modifier.weight(1f).testTag("syncplay-native-queue-scroll"),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item(key = "section:transport") {
                        state.error?.let { Text(it, color = Color(0xFFFF8A80)) }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SyncActionButton(label("refresh_group", "Refresh group"), "syncplay-native-refresh", enabled) { action("refresh") }
                            SyncActionButton(label("leave", "Leave"), "syncplay-native-leave", leaveEnabled) { action("leave") }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SyncActionButton(label("previous", "Previous"), "syncplay-native-previous", gated(state.hasPrevious), Modifier.weight(1f), dimmed = !state.hasPrevious) { if (state.hasPrevious) action("previous") }
                            SyncActionButton(
                                if (viewModel.isPlaying) label("pause", "Pause") else label("play", "Play"),
                                "syncplay-native-play-pause", enabled, Modifier.weight(1f)
                            ) { action(if (viewModel.isPlaying) "pause" else "play") }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SyncActionButton(label("next", "Next"), "syncplay-native-next", gated(state.hasNext), Modifier.weight(1f), dimmed = !state.hasNext) { if (state.hasNext) action("next") }
                            SyncActionButton(label("stop", "Stop"), "syncplay-native-stop", enabled, Modifier.weight(1f)) { action("stop") }
                        }
                    }
                    item(key = "section:options") {
                        Text(label("playback_options", "Playback options"), fontWeight = FontWeight.Bold)
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(label("repeat", "Repeat"), Modifier.weight(1f))
                            val modes = listOf("RepeatNone", "RepeatAll", "RepeatOne")
                            SyncActionButton(
                                label("repeat_modes_${state.repeatMode}", when (state.repeatMode) {
                                    "RepeatAll" -> "All"; "RepeatOne" -> "One"; else -> "Off"
                                }), "syncplay-native-repeat", enabled
                            ) { action("repeat", "mode" to modes[(modes.indexOf(state.repeatMode).coerceAtLeast(0) + 1) % modes.size]) }
                        }
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(label("shuffle", "Shuffle"), Modifier.weight(1f))
                            Switch(
                                checked = state.shuffleMode == "Shuffle", enabled = enabled,
                                onCheckedChange = { action("shuffle", "mode" to if (it) "Shuffle" else "Sorted") },
                                modifier = Modifier.testTag("syncplay-native-shuffle").semantics { contentDescription = label("shuffle", "Shuffle") }
                            )
                        }
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(label("ignore_wait", "Don't wait for this device"), Modifier.weight(1f))
                            Switch(
                                checked = state.ignoreWait, enabled = enabled,
                                onCheckedChange = { action("ignoreWait", "value" to it) },
                                modifier = Modifier.testTag("syncplay-native-ignore-wait").semantics { contentDescription = label("ignore_wait", "Don't wait for this device") }
                            )
                        }
                        Text(label("ignore_wait_hint", "The group can start or resume without waiting for this device to be ready. This setting applies only to your current session."), fontSize = 12.sp, color = Color.LightGray)
                        HorizontalDivider(Modifier.padding(top = 12.dp))
                    }
                    item(key = "section:queue-header") {
                        Text(label("queue", "Queue"), fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        if (state.playlist.isEmpty()) Text(label("empty_queue", "The queue is empty"), color = Color.LightGray)
                    }
                    itemsIndexed(state.playlist, key = { _, item -> item.playlistItemId }) { index, item ->
                        val current = item.playlistItemId == state.currentPlaylistItemId
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                RemoteImage(
                                    url = item.imageUrl,
                                    modifier = Modifier.width(40.dp).height(60.dp).clip(RoundedCornerShape(4.dp))
                                )
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        item.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                        fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal,
                                        color = if (current) PlayerAccentColor else Color.White
                                    )
                                    item.subtitle?.takeIf { it.isNotBlank() }?.let {
                                        Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 12.sp, color = Color.LightGray)
                                    }
                                    if (current) Text(label("now_playing", "Now playing"), color = PlayerAccentColor, fontSize = 12.sp)
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                SyncActionButton(label("play_now", "Play now"), "syncplay-native-select-${item.playlistItemId}", enabled, Modifier.weight(1f)) { action("select", "playlistItemId" to item.playlistItemId) }
                                SyncActionButton(label("remove", "Remove"), "syncplay-native-remove-${item.playlistItemId}", enabled, Modifier.weight(1f)) { action("remove", "playlistItemId" to item.playlistItemId) }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                SyncActionButton(label("move_up", "Move up"), "syncplay-native-up-${item.playlistItemId}", gated(index > 0), Modifier.weight(1f), dimmed = index == 0) { if (index > 0) action("move", "playlistItemId" to item.playlistItemId, "newIndex" to index - 1) }
                                SyncActionButton(label("move_down", "Move down"), "syncplay-native-down-${item.playlistItemId}", gated(index < state.playlist.lastIndex), Modifier.weight(1f), dimmed = index >= state.playlist.lastIndex) { if (index < state.playlist.lastIndex) action("move", "playlistItemId" to item.playlistItemId, "newIndex" to index + 1) }
                            }
                        }
                    }
                    item(key = "section:clear") {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SyncActionButton(label("clear_upcoming", "Clear upcoming"), "syncplay-native-clear-upcoming", gated(state.playlist.isNotEmpty()), Modifier.weight(1f), dimmed = state.playlist.isEmpty()) { if (state.playlist.isNotEmpty()) action("clear", "value" to false) }
                            SyncActionButton(label("clear_all", "Clear all"), "syncplay-native-clear-all", gated(state.playlist.isNotEmpty()), Modifier.weight(1f), dimmed = state.playlist.isEmpty()) { if (state.playlist.isNotEmpty()) action("clear", "value" to true) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SyncActionButton(
    label: String, tag: String, enabled: Boolean,
    modifier: Modifier = Modifier,
    // Enabled but unavailable: the TV form of disabled, see the control policy.
    dimmed: Boolean = false,
    onClick: () -> Unit
) {
    var focused by remember { mutableStateOf(false) }
    Button(
        enabled = enabled, onClick = onClick,
        modifier = modifier.heightIn(min = 48.dp)
            .alpha(if (enabled && dimmed) 0.4f else 1f)
            .testTag(tag)
            .onFocusChanged { focused = it.isFocused }
            .then(if (focused) Modifier.border(2.dp, Color.White, RoundedCornerShape(24.dp)) else Modifier)
            .semantics { contentDescription = label }
    ) { Text(label, fontSize = 13.sp) }
}
