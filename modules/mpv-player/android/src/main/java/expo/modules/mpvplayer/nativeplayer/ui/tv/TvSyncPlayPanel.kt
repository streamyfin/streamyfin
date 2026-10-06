package expo.modules.mpvplayer.nativeplayer.ui.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ListItem
import androidx.tv.material3.ListItemDefaults
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.Text
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.SyncPlayPlaylistItemRecord
import expo.modules.mpvplayer.nativeplayer.SyncPlayStateRecord
import expo.modules.mpvplayer.nativeplayer.syncPlayQueueActionAllowed
import expo.modules.mpvplayer.nativeplayer.ui.RemoteImage
import kotlinx.coroutines.delay

private val Destructive = Color(0xFFFF6B60)
private val DestructiveOnFocus = Color(0xFFB3261E)
private val RepeatModes = listOf("RepeatNone", "RepeatAll", "RepeatOne")
// Long enough for a row that was just composed to take focus.
private const val FOCUS_DELAY_MS = 60L
private const val REPEAT_ROW = "option:repeat"

/**
 * The group's queue and modes in the TV player: the Apple TV panel
 * (TVSyncPlayPanel.swift) for a DPAD. The queue on the left, the modes and
 * the group on the right. An entry opens its own page of actions, since a
 * remote can neither drag nor swipe. Presses are requests to the shared
 * Jellyfin coordinator in JS; nothing here changes the decoder.
 */
@Composable
fun TvSyncPlayPanel(viewModel: PlayerViewModel, modifier: Modifier = Modifier) {
    val state = viewModel.syncPlay ?: return
    fun label(key: String, fallback: String) = viewModel.syncStr(key, fallback)
    // Nothing here is ever disabled: a disabled row hands its focus to a
    // neighbour, and the state under these rows changes on every request,
    // often because of the row's own press. What cannot act dims and ignores
    // the press.
    fun action(name: String, vararg details: Pair<String, Any?>) {
        val current = viewModel.syncPlay ?: return
        if (syncPlayQueueActionAllowed(current.connected || name == "leave", current.busy)) {
            viewModel.syncPlayAction(name, mapOf(*details))
        }
    }

    val menuEntry = state.playlist.firstOrNull { it.playlistItemId == viewModel.syncPlayEntryMenu }
    // The row that takes focus next: the playing entry when the panel opens,
    // the entry whose page was just left, a neighbour of a removed one.
    var focusTarget by remember {
        mutableStateOf<String?>(
            (state.playlist.firstOrNull { it.playlistItemId == state.currentPlaylistItemId }
                ?: state.playlist.firstOrNull())?.playlistItemId ?: REPEAT_ROW
        )
    }
    // An entry removed by someone else takes its page with it.
    LaunchedEffect(viewModel.syncPlayEntryMenu, menuEntry == null) {
        if (viewModel.syncPlayEntryMenu != null && menuEntry == null) viewModel.syncPlayEntryMenu = null
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            // A modal moment, as the subtitle search: the video dims so the
            // panel reads as the only interactive surface.
            .background(Color.Black.copy(alpha = 0.7f))
            .semantics { testTagsAsResourceId = true }
            .testTag("syncplay-native-queue"),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                // Sized so the right column shows all of its rows at once.
                .size(width = 1040.dp, height = 620.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xFF1A1A1A))
                .padding(28.dp)
        ) {
            if (menuEntry != null) {
                EntryPage(
                    entry = menuEntry,
                    index = state.playlist.indexOf(menuEntry),
                    count = state.playlist.size,
                    connected = state.connected,
                    label = ::label,
                    onPlay = {
                        action("select", "playlistItemId" to menuEntry.playlistItemId)
                        focusTarget = menuEntry.playlistItemId
                        viewModel.syncPlayEntryMenu = null
                    },
                    onMove = { to -> action("move", "playlistItemId" to menuEntry.playlistItemId, "newIndex" to to) },
                    onRemove = {
                        val index = state.playlist.indexOf(menuEntry)
                        focusTarget = (state.playlist.getOrNull(index + 1) ?: state.playlist.getOrNull(index - 1))
                            ?.playlistItemId ?: REPEAT_ROW
                        action("remove", "playlistItemId" to menuEntry.playlistItemId)
                        viewModel.syncPlayEntryMenu = null
                    }
                )
            } else {
                Header(state, label("reconnecting", "Reconnecting"))
                Spacer(Modifier.height(18.dp))
                Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                    Queue(
                        state = state,
                        focusTarget = focusTarget,
                        onFocused = { focusTarget = null },
                        label = ::label,
                        onOpen = { id -> focusTarget = id; viewModel.syncPlayEntryMenu = id },
                        modifier = Modifier.weight(1f).fillMaxHeight()
                    )
                    Options(
                        state = state,
                        focusRepeat = focusTarget == REPEAT_ROW,
                        onFocused = { focusTarget = null },
                        label = ::label,
                        action = ::action,
                        onLeave = { action("leave"); viewModel.closeSyncPlayQueue() },
                        modifier = Modifier.width(360.dp).fillMaxHeight()
                    )
                }
            }
        }
    }
}

@Composable
private fun Header(state: SyncPlayStateRecord, reconnecting: String) {
    Text(
        state.groupName, color = TvPalette.OnSurface, fontSize = 24.sp, fontWeight = FontWeight.Bold,
        maxLines = 1, overflow = TextOverflow.Ellipsis
    )
    Text(
        if (state.connected) state.status else reconnecting,
        color = TvPalette.OnSurfaceDim, fontSize = 15.sp
    )
    state.error?.let {
        Text(it, color = Color(0xFFFFB74D), fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        title, color = TvPalette.OnSurfaceDim, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 4.dp, bottom = 8.dp)
    )
}

@Composable
private fun Queue(
    state: SyncPlayStateRecord,
    focusTarget: String?,
    onFocused: () -> Unit,
    label: (String, String) -> String,
    onOpen: (String) -> Unit,
    modifier: Modifier
) {
    val targetIndex = state.playlist.indexOfFirst { it.playlistItemId == focusTarget }
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = targetIndex.coerceAtLeast(0))
    // A row can only take focus once it is composed.
    LaunchedEffect(focusTarget) {
        if (targetIndex >= 0) listState.scrollToItem(targetIndex)
    }
    Column(modifier) {
        SectionTitle(label("queue", "Shared queue"))
        if (state.playlist.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    label("empty_queue", "The queue is empty"),
                    color = TvPalette.OnSurfaceDim, fontSize = 16.sp
                )
            }
            return@Column
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            // Room for the focused row's scale at the edges of the list.
            contentPadding = PaddingValues(vertical = 6.dp, horizontal = 4.dp)
        ) {
            itemsIndexed(state.playlist, key = { _, item -> item.playlistItemId }) { index, item ->
                val id = item.playlistItemId
                val current = id == state.currentPlaylistItemId
                val requester = remember(id) { FocusRequester() }
                LaunchedEffect(focusTarget) {
                    if (focusTarget == id) {
                        delay(FOCUS_DELAY_MS)
                        // Throws when the row is not attached yet.
                        if (runCatching { requester.requestFocus() }.isSuccess) onFocused()
                    }
                }
                ListItem(
                    selected = current,
                    onClick = { onOpen(id) },
                    leadingContent = {
                        RemoteImage(
                            url = item.imageUrl,
                            modifier = Modifier.size(width = 36.dp, height = 54.dp).clip(RoundedCornerShape(4.dp))
                        )
                    },
                    headlineContent = {
                        Text(
                            item.title, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            fontWeight = if (current) FontWeight.Bold else FontWeight.Medium
                        )
                    },
                    supportingContent = item.subtitle?.takeIf { it.isNotBlank() }?.let { subtitle ->
                        { Text(subtitle, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    },
                    trailingContent = if (current) {
                        {
                            // Follows the row's focus state: white on the dark
                            // row, black on the focused one.
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Filled.PlayArrow, contentDescription = null,
                                    tint = LocalContentColor.current, modifier = Modifier.size(18.dp)
                                )
                                Text(
                                    label("now_playing", "Current video"), fontSize = 13.sp,
                                    modifier = Modifier.padding(start = 4.dp)
                                )
                            }
                        }
                    } else null,
                    colors = rowColors(),
                    modifier = Modifier
                        .focusRequester(requester)
                        .alpha(if (state.connected) 1f else 0.4f)
                        .testTag("syncplay-native-select-$index")
                )
            }
        }
    }
}

@Composable
private fun Options(
    state: SyncPlayStateRecord,
    focusRepeat: Boolean,
    onFocused: () -> Unit,
    label: (String, String) -> String,
    action: (String, Array<out Pair<String, Any?>>) -> Unit,
    onLeave: () -> Unit,
    modifier: Modifier
) {
    val repeatRequester = remember { FocusRequester() }
    LaunchedEffect(focusRepeat) {
        if (focusRepeat) {
            delay(FOCUS_DELAY_MS)
            if (runCatching { repeatRequester.requestFocus() }.isSuccess) onFocused()
        }
    }
    fun send(name: String, vararg details: Pair<String, Any?>) = action(name, details)
    fun repeatName(mode: String) = label(
        "repeat_modes_$mode",
        when (mode) { "RepeatAll" -> "All"; "RepeatOne" -> "One"; else -> "Off" }
    )
    fun onOff(on: Boolean) = if (on) label("on", "On") else label("off", "Off")
    val shuffled = state.shuffleMode == "Shuffle"
    val hasQueue = state.playlist.isNotEmpty()

    Column(modifier) {
        SectionTitle(label("playback_options", "Playback options"))
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 6.dp, horizontal = 4.dp)
        ) {
            // A remote has nothing to flick and no menu worth opening for
            // three values: a press steps to the next one.
            item(key = "repeat") {
                OptionRow(
                    label("repeat", "Repeat"), repeatName(state.repeatMode), "syncplay-native-repeat",
                    capable = state.connected, modifier = Modifier.focusRequester(repeatRequester)
                ) {
                    send("repeat", "mode" to RepeatModes[(RepeatModes.indexOf(state.repeatMode).coerceAtLeast(0) + 1) % RepeatModes.size])
                }
            }
            item(key = "shuffle") {
                OptionRow(label("shuffle", "Shuffle"), onOff(shuffled), "syncplay-native-shuffle", state.connected) {
                    send("shuffle", "mode" to if (shuffled) "Sorted" else "Shuffle")
                }
            }
            item(key = "ignore-wait") {
                OptionRow(
                    label("ignore_wait", "Don't wait for this device"), onOff(state.ignoreWait),
                    "syncplay-native-ignore-wait", state.connected
                ) { send("ignoreWait", "value" to !state.ignoreWait) }
            }
            item(key = "gap") { Spacer(Modifier.height(10.dp)) }
            item(key = "clear-upcoming") {
                OptionRow(
                    label("clear_upcoming", "Keep current video only"), null,
                    "syncplay-native-clear-upcoming", state.connected && hasQueue
                ) { if (hasQueue) send("clear", "value" to false) }
            }
            item(key = "clear-all") {
                OptionRow(
                    label("clear_all", "Clear queue and stop"), null, "syncplay-native-clear-all",
                    state.connected && hasQueue, destructive = true
                ) { if (hasQueue) send("clear", "value" to true) }
            }
            item(key = "stop") {
                OptionRow(
                    label("stop", "Stop playback"), null, "syncplay-native-stop",
                    state.connected, destructive = true
                ) { send("stop") }
            }
            // Leaving works without the server: it is what a member who lost
            // it wants to do.
            item(key = "leave") {
                OptionRow(
                    label("leave", "Leave group"), null, "syncplay-native-leave",
                    capable = true, destructive = true, onClick = onLeave
                )
            }
        }
    }
}

/** What an entry can do, on a page of its own: the Apple TV row's menu. */
@Composable
private fun EntryPage(
    entry: SyncPlayPlaylistItemRecord,
    index: Int,
    count: Int,
    connected: Boolean,
    label: (String, String) -> String,
    onPlay: () -> Unit,
    onMove: (Int) -> Unit,
    onRemove: () -> Unit
) {
    val first = remember { FocusRequester() }
    LaunchedEffect(entry.playlistItemId) {
        delay(FOCUS_DELAY_MS)
        runCatching { first.requestFocus() }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        RemoteImage(
            url = entry.imageUrl,
            modifier = Modifier.size(width = 48.dp, height = 72.dp).clip(RoundedCornerShape(6.dp))
        )
        Column(Modifier.padding(start = 16.dp)) {
            Text(
                entry.title, color = TvPalette.OnSurface, fontSize = 24.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis
            )
            entry.subtitle?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = TvPalette.OnSurfaceDim, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
    Spacer(Modifier.height(18.dp))
    Column(
        Modifier.width(420.dp).padding(horizontal = 4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        OptionRow(
            label("play_now", "Play now"), null, "syncplay-native-entry-play", connected,
            modifier = Modifier.focusRequester(first), onClick = onPlay
        )
        // A move keeps the page open: an entry usually travels more than
        // one place.
        OptionRow(label("move_up", "Move up"), null, "syncplay-native-entry-up", connected && index > 0) {
            if (index > 0) onMove(index - 1)
        }
        OptionRow(label("move_down", "Move down"), null, "syncplay-native-entry-down", connected && index < count - 1) {
            if (index < count - 1) onMove(index + 1)
        }
        OptionRow(
            label("remove", "Remove"), null, "syncplay-native-entry-remove", connected,
            destructive = true, onClick = onRemove
        )
    }
}

@Composable
private fun OptionRow(
    title: String,
    value: String?,
    tag: String,
    capable: Boolean,
    modifier: Modifier = Modifier,
    destructive: Boolean = false,
    onClick: () -> Unit
) {
    ListItem(
        selected = false,
        onClick = onClick,
        headlineContent = {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        },
        trailingContent = value?.let { { Text(it, fontSize = 15.sp, modifier = Modifier.alpha(0.7f)) } },
        colors = if (destructive) {
            ListItemDefaults.colors(
                containerColor = TvPalette.RowFill,
                focusedContainerColor = TvPalette.FocusFill,
                contentColor = Destructive,
                focusedContentColor = DestructiveOnFocus
            )
        } else rowColors(),
        modifier = modifier.alpha(if (capable) 1f else 0.4f).testTag(tag)
    )
}

@Composable
private fun rowColors() = ListItemDefaults.colors(
    containerColor = TvPalette.RowFill,
    focusedContainerColor = TvPalette.FocusFill,
    contentColor = TvPalette.OnSurface,
    focusedContentColor = TvPalette.OnFocus,
    selectedContainerColor = TvPalette.RowFill,
    selectedContentColor = TvPalette.OnSurface
)
