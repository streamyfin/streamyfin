package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.SyncPlayPlaylistItemRecord
import expo.modules.mpvplayer.nativeplayer.syncPlayQueueActionAllowed
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

private val SheetBackground = Color(0xFF1C1C1E)
private val SectionBackground = Color(0xFF2C2C2E)
private val SecondaryText = Color(0xFF8E8E93)
private val Destructive = Color(0xFFFF453A)
private val SectionCorner = 14.dp
// Fixed, so a drag can be turned into a queue position without measuring.
private val QueueRowHeight = 76.dp
// How long a dragged order stays on screen without the server confirming it.
private const val REFUSED_MOVE_RESET_MS = 2000L
private val RepeatModes = listOf("RepeatNone", "RepeatAll", "RepeatOne")

/**
 * The phone form of the queue: the same sections, in the same order, as the
 * iOS sheet. Presses are requests to the shared Jellyfin coordinator in JS;
 * nothing here changes the decoder.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SyncPlayQueuePhoneSheet(viewModel: PlayerViewModel) {
    val state = viewModel.syncPlay ?: return
    val enabled = state.connected && !state.busy
    fun label(key: String, fallback: String) = viewModel.syncStr(key, fallback)
    fun action(name: String, vararg details: Pair<String, Any?>) {
        val current = viewModel.syncPlay ?: return
        if (syncPlayQueueActionAllowed(current.connected || name == "leave", current.busy)) {
            viewModel.syncPlayAction(name, mapOf(*details))
        }
    }
    fun repeatName(mode: String) = label(
        "repeat_modes_$mode",
        when (mode) { "RepeatAll" -> "All"; "RepeatOne" -> "One"; else -> "Off" }
    )

    // The server owns the order: a drag is a request, shown at once and
    // replaced by the answer. A refused move sends no answer, hence the timer.
    val serverOrder = state.playlist.map { it.playlistItemId }
    var draggedOrder by remember(serverOrder) { mutableStateOf<List<String>?>(null) }
    LaunchedEffect(draggedOrder) {
        if (draggedOrder != null) { delay(REFUSED_MOVE_RESET_MS); draggedOrder = null }
    }
    val entries = draggedOrder?.let { order ->
        val byId = state.playlist.associateBy { it.playlistItemId }
        order.mapNotNull { byId[it] }.takeIf { it.size == state.playlist.size }
    } ?: state.playlist
    val latestEntries by rememberUpdatedState(entries)

    val rowPx = with(LocalDensity.current) { QueueRowHeight.toPx() }
    var dragId by remember { mutableStateOf<String?>(null) }
    var dragOffset by remember { mutableFloatStateOf(0f) }
    fun dropTarget(from: Int, last: Int) = (from + (dragOffset / rowPx).roundToInt()).coerceIn(0, last)
    fun endDrag(commit: Boolean) {
        val list = latestEntries
        val id = dragId
        val from = list.indexOfFirst { it.playlistItemId == id }
        val to = if (from < 0) -1 else dropTarget(from, list.lastIndex)
        dragId = null
        dragOffset = 0f
        if (!commit || id == null || from < 0 || to == from) return
        draggedOrder = list.map { it.playlistItemId }.toMutableList().apply { add(to, removeAt(from)) }
        action("move", "playlistItemId" to id, "newIndex" to to)
    }

    ModalBottomSheet(
        onDismissRequest = { viewModel.closeSyncPlayQueue() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = SheetBackground,
        contentColor = Color.White
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .semantics { testTagsAsResourceId = true }
                .testTag("syncplay-native-queue")
        ) {
            item(key = "title") {
                Text(
                    label("queue", "Shared queue"),
                    fontSize = 22.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 4.dp, bottom = 16.dp)
                )
            }

            item(key = "section:group") {
                Section(label("title", "SyncPlay")) {
                    Text(
                        state.groupName, fontWeight = FontWeight.SemiBold, fontSize = 16.sp,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)
                    )
                    Divider()
                    Text(
                        if (state.connected) state.status else label("reconnecting", "Reconnecting"),
                        color = SecondaryText,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)
                    )
                    state.error?.let {
                        Divider()
                        Text(it, color = Destructive, modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp))
                    }
                    Divider()
                    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
                        TransportButton(
                            Icons.Default.SkipPrevious, label("previous", "Previous"),
                            "syncplay-native-previous", enabled && state.hasPrevious
                        ) { action("previous") }
                        TransportButton(
                            if (viewModel.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            if (viewModel.isPlaying) label("pause", "Pause") else label("play", "Play"),
                            "syncplay-native-play-pause", enabled
                        ) { action(if (viewModel.isPlaying) "pause" else "play") }
                        TransportButton(
                            Icons.Default.SkipNext, label("next", "Next"),
                            "syncplay-native-next", enabled && state.hasNext
                        ) { action("next") }
                    }
                }
                Spacer(Modifier.height(24.dp))
            }

            item(key = "section:options") {
                Section(label("playback_options", "Playback options")) {
                    var choosing by remember { mutableStateOf(false) }
                    ValueRow(
                        label("repeat", "Repeat"), "syncplay-native-repeat", enabled,
                        onClick = { choosing = true }
                    ) {
                        // The menu hangs from the value it changes.
                        Box {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(repeatName(state.repeatMode), color = SecondaryText)
                                Icon(
                                    Icons.Default.UnfoldMore, contentDescription = null,
                                    tint = SecondaryText, modifier = Modifier.padding(start = 2.dp).size(18.dp)
                                )
                            }
                            DropdownMenu(expanded = choosing, onDismissRequest = { choosing = false }) {
                                RepeatModes.forEach { mode ->
                                    DropdownMenuItem(
                                        text = { Text(repeatName(mode)) },
                                        leadingIcon = {
                                            if (mode == state.repeatMode) Icon(Icons.Default.Check, contentDescription = null)
                                        },
                                        onClick = { choosing = false; action("repeat", "mode" to mode) }
                                    )
                                }
                            }
                        }
                    }
                    Divider()
                    val shuffle = label("shuffle", "Shuffle")
                    ValueRow(shuffle, null, enabled) {
                        Switch(
                            checked = state.shuffleMode == "Shuffle", enabled = enabled,
                            onCheckedChange = { action("shuffle", "mode" to if (it) "Shuffle" else "Sorted") },
                            modifier = Modifier.testTag("syncplay-native-shuffle").semantics { contentDescription = shuffle }
                        )
                    }
                    Divider()
                    val ignoreWait = label("ignore_wait", "Don't wait for this device")
                    ValueRow(ignoreWait, null, enabled) {
                        Switch(
                            checked = state.ignoreWait, enabled = enabled,
                            onCheckedChange = { action("ignoreWait", "value" to it) },
                            modifier = Modifier.testTag("syncplay-native-ignore-wait").semantics { contentDescription = ignoreWait }
                        )
                    }
                    Divider()
                    Text(
                        label(
                            "ignore_wait_hint",
                            "The group can start or resume without waiting for this device to be ready. This setting applies only to your current session."
                        ),
                        fontSize = 12.sp, lineHeight = 16.sp, color = SecondaryText,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
                    )
                }
                Spacer(Modifier.height(24.dp))
            }

            item(key = "section:queue-title") {
                SectionTitle(label("queue", "Shared queue"))
            }
            // One card drawn across several list items: the entries stay
            // lazy, and only the first and the last piece round their corners.
            itemsIndexed(entries, key = { _, item -> item.playlistItemId }) { index, item ->
                val id = item.playlistItemId
                val dragging = id == dragId
                val from = entries.indexOfFirst { it.playlistItemId == dragId }
                val target = if (from < 0) -1 else dropTarget(from, entries.lastIndex)
                // The entries between where the drag began and where it is
                // make room for it.
                val shift = when {
                    from < 0 || dragging -> 0f
                    index in (from + 1)..target -> -rowPx
                    index in target until from -> rowPx
                    else -> 0f
                }
                val animatedShift by animateFloatAsState(
                    shift,
                    // Once dropped, the list itself has the new order.
                    animationSpec = if (dragId == null) snap() else spring(),
                    label = "queue-shift"
                )
                QueueRow(
                    item = item,
                    current = id == state.currentPlaylistItemId,
                    enabled = enabled,
                    dragging = dragging,
                    nowPlaying = label("now_playing", "Current video"),
                    remove = label("remove", "Remove"),
                    modifier = Modifier
                        .zIndex(if (dragging) 1f else 0f)
                        .graphicsLayer { translationY = if (dragging) dragOffset else animatedShift }
                        .clip(RoundedCornerShape(topStart = if (index == 0) SectionCorner else 0.dp, topEnd = if (index == 0) SectionCorner else 0.dp)),
                    handle = Modifier.pointerInput(id, enabled) {
                        if (!enabled) return@pointerInput
                        detectDragGestures(
                            onDragStart = { dragId = id; dragOffset = 0f },
                            onDrag = { change, amount -> change.consume(); dragOffset += amount.y },
                            onDragEnd = { endDrag(commit = true) },
                            onDragCancel = { endDrag(commit = false) }
                        )
                    },
                    onSelect = { action("select", "playlistItemId" to id) },
                    onRemove = { action("remove", "playlistItemId" to id) }
                )
            }
            item(key = "section:clear") {
                val empty = state.playlist.isEmpty()
                Column(
                    Modifier.fillMaxWidth().clip(
                        RoundedCornerShape(
                            topStart = if (empty) SectionCorner else 0.dp,
                            topEnd = if (empty) SectionCorner else 0.dp,
                            bottomStart = SectionCorner, bottomEnd = SectionCorner
                        )
                    ).background(SectionBackground)
                ) {
                    if (empty) {
                        Text(
                            label("empty_queue", "The queue is empty"), color = SecondaryText,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)
                        )
                    }
                    Divider()
                    ActionRow(label("clear_upcoming", "Keep current video only"), "syncplay-native-clear-upcoming", enabled && !empty) {
                        action("clear", "value" to false)
                    }
                    Divider()
                    ActionRow(label("clear_all", "Clear queue and stop"), "syncplay-native-clear-all", enabled && !empty, Destructive) {
                        action("clear", "value" to true)
                    }
                }
                Spacer(Modifier.height(24.dp))
            }

            item(key = "section:group-actions") {
                Section(null) {
                    ActionRow(label("refresh_group", "Refresh group"), "syncplay-native-refresh", enabled) { action("refresh") }
                    Divider()
                    ActionRow(label("stop", "Stop playback"), "syncplay-native-stop", enabled, Destructive) { action("stop") }
                    Divider()
                    // Leaving works without the server: it is what a member
                    // who lost it wants to do.
                    ActionRow(label("leave", "Leave group"), "syncplay-native-leave", !state.busy, Destructive) {
                        action("leave")
                        viewModel.closeSyncPlayQueue()
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        title, color = SecondaryText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 16.dp, bottom = 8.dp)
    )
}

@Composable
private fun Section(title: String?, content: @Composable ColumnScope.() -> Unit) {
    Column {
        title?.let { SectionTitle(it) }
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(SectionCorner)).background(SectionBackground),
            content = content
        )
    }
}

@Composable
private fun Divider() {
    HorizontalDivider(Modifier.padding(start = 16.dp), thickness = 0.5.dp, color = Color(0x33FFFFFF))
}

/** A label with its control or value at the trailing edge. */
@Composable
private fun ValueRow(
    title: String, tag: String?, enabled: Boolean,
    onClick: (() -> Unit)? = null,
    trailing: @Composable () -> Unit
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .then(if (tag != null) Modifier.testTag(tag) else Modifier)
            .then(if (onClick != null) Modifier.clickable(enabled = enabled, onClick = onClick) else Modifier)
            .alpha(if (enabled) 1f else 0.5f)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, fontSize = 16.sp, modifier = Modifier.weight(1f))
        trailing()
    }
}

/** A row that is itself the button. */
@Composable
private fun ActionRow(
    title: String, tag: String, enabled: Boolean,
    color: Color = Color.White,
    onClick: () -> Unit
) {
    Text(
        title, color = color, fontSize = 16.sp,
        modifier = Modifier
            .fillMaxWidth()
            .testTag(tag)
            .clickable(enabled = enabled, onClick = onClick)
            .alpha(if (enabled) 1f else 0.4f)
            .padding(horizontal = 16.dp, vertical = 16.dp)
    )
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TransportButton(
    icon: ImageVector, title: String, tag: String, enabled: Boolean,
    onClick: () -> Unit
) {
    Row(
        Modifier
            .weight(1f)
            .heightIn(min = 52.dp)
            .testTag(tag)
            .clip(RoundedCornerShape(10.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .alpha(if (enabled) 1f else 0.4f)
            .semantics { contentDescription = title },
        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(24.dp))
        Text(title, fontSize = 15.sp, maxLines = 1, modifier = Modifier.padding(start = 6.dp))
    }
}

/** Handle, poster, title and what the entry belongs to: the music queue's row. */
@Composable
private fun QueueRow(
    item: SyncPlayPlaylistItemRecord,
    current: Boolean,
    enabled: Boolean,
    dragging: Boolean,
    nowPlaying: String,
    remove: String,
    modifier: Modifier,
    handle: Modifier,
    onSelect: () -> Unit,
    onRemove: () -> Unit
) {
    Row(
        modifier
            .fillMaxWidth()
            .height(QueueRowHeight)
            .background(if (dragging) Color(0xFF3A3A3C) else SectionBackground)
            .testTag("syncplay-native-select-${item.playlistItemId}")
            .clickable(enabled = enabled, onClick = onSelect)
            .alpha(if (enabled) 1f else 0.5f),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Default.DragHandle, contentDescription = null, tint = SecondaryText,
            modifier = handle.padding(start = 8.dp).size(44.dp).padding(11.dp)
        )
        RemoteImage(
            url = item.imageUrl,
            modifier = Modifier.width(40.dp).height(60.dp).clip(RoundedCornerShape(4.dp))
        )
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(
                item.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 16.sp,
                fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal,
                color = if (current) PlayerAccentColor else Color.White
            )
            item.subtitle?.takeIf { it.isNotBlank() }?.let {
                Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 13.sp, color = SecondaryText)
            }
        }
        if (current) {
            Icon(
                Icons.Default.Movie, contentDescription = nowPlaying, tint = PlayerAccentColor,
                modifier = Modifier.size(22.dp)
            )
        }
        Icon(
            Icons.Default.Close, contentDescription = remove, tint = SecondaryText,
            modifier = Modifier
                .testTag("syncplay-native-remove-${item.playlistItemId}")
                .clip(RoundedCornerShape(22.dp))
                .clickable(enabled = enabled, onClick = onRemove)
                .size(44.dp)
                .padding(12.dp)
        )
    }
}
