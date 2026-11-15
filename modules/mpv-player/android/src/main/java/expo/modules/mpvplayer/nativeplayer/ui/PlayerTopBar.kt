package expo.modules.mpvplayer.nativeplayer.ui

import android.graphics.Rect
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AspectRatio
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.CastConnected
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FormatListBulleted
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PictureInPicture
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.cast.target.TargetPhase
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import kotlin.math.roundToInt

@Composable
fun PlayerTopBar(
    viewModel: PlayerViewModel,
    compact: Boolean = false,
    onPipClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Close button
        IconButton(
            onClick = { viewModel.close() },
            modifier = Modifier.size(40.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = viewModel.strings.get("close", "Close"),
                tint = Color.White
            )
        }

        // Title and Subtitle
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 8.dp)
        ) {
            viewModel.metadata?.title?.let { title ->
                Text(
                    text = title,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            viewModel.metadata?.subtitle?.let { subtitle ->
                Text(
                    text = subtitle,
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            viewModel.syncPlay?.let { state ->
                Text(
                    text = "${state.groupName} · ${if (state.connected) state.status else viewModel.syncStr("reconnecting", "Reconnecting")}",
                    color = PlayerAccentColor,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        // Not in a SyncPlay group, which a later join can bring into a player that showed it.
        if (viewModel.capabilities.cast && !viewModel.syncPlayActive) CastButton(viewModel)

        if (viewModel.syncPlayActive) {
            IconButton(onClick = { viewModel.openSyncPlayQueue() }, modifier = Modifier.size(48.dp)) {
                Icon(
                    imageVector = Icons.Default.FormatListBulleted,
                    contentDescription = viewModel.syncStr("queue", "Queue"),
                    tint = PlayerAccentColor
                )
            }
        }

        // PiP Button
        if (onPipClick != null) {
            IconButton(
                onClick = { onPipClick() },
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.PictureInPicture,
                    contentDescription = viewModel.str("pictureInPicture", "Picture in picture"),
                    tint = Color.White
                )
            }
        }

        // Zoom to fill button (if not compact)
        if (!compact && viewModel.capabilities.zoom) {
            IconButton(
                onClick = { viewModel.toggleZoomToFill() },
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.AspectRatio,
                    contentDescription = viewModel.strings.get("zoomToFill", "Zoom to Fill"),
                    tint = if (viewModel.isZoomedToFill) PlayerAccentColor else Color.White
                )
            }
        }

        // Episode list button
        if (viewModel.episodeList.isNotEmpty() && !viewModel.syncPlayActive) {
            IconButton(
                onClick = {
                    viewModel.showEpisodeList = true
                    viewModel.scheduleAutoHide()
                },
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.FormatListBulleted,
                    contentDescription = viewModel.strings.get("episodes", "Episodes"),
                    tint = Color.White
                )
            }
        }

        // Speed Menu Button (if not compact)
        if (!compact && !viewModel.syncPlayActive && viewModel.capabilities.speed) {
            SpeedMenu(viewModel) { open ->
                IconButton(
                    onClick = open,
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Speed,
                        contentDescription = viewModel.strings.get("speed", "Speed"),
                        tint = Color.White
                    )
                }
            }
        }

        // Audio Menu
        if (viewModel.audioMenu.isNotEmpty()) {
            AudioMenu(viewModel) { open ->
                IconButton(
                    onClick = open,
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.GraphicEq,
                        contentDescription = viewModel.strings.get("audio", "Audio"),
                        tint = Color.White
                    )
                }
            }
        }

        // Subtitles Menu
        if (viewModel.subtitleMenu.isNotEmpty()) {
            SubtitleMenu(viewModel) { open ->
                IconButton(
                    onClick = open,
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ClosedCaption,
                        contentDescription = viewModel.strings.get("subtitles", "Subtitles"),
                        tint = Color.White
                    )
                }
            }
        }

        // More Menu
        MoreMenu(viewModel, compact = compact) { open ->
            IconButton(
                onClick = open,
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.MoreVert,
                    contentDescription = "More",
                    tint = Color.White
                )
            }
        }
    }
}

fun formatTimeSec(seconds: Double): String {
    val total = seconds.toInt().coerceAtLeast(0)
    val hrs = total / 3600
    val mins = (total % 3600) / 60
    val secs = total % 60
    return if (hrs > 0) {
        String.format("%d:%02d:%02d", hrs, mins, secs)
    } else {
        String.format("%d:%02d", mins, secs)
    }
}

// Hands the video off to a receiver through the output sheet; the glyph says whether one is connected, and a ring
// turns while one connects or reconnects. The sheet points at the button, from its bounds in the window.
@Composable
private fun CastButton(viewModel: PlayerViewModel) {
    var anchor by remember { mutableStateOf<Rect?>(null) }
    val connected = viewModel.castPhase == TargetPhase.CONNECTED
    Box(contentAlignment = Alignment.Center) {
        IconButton(
            onClick = { anchor?.let(viewModel::openOutputSheet) },
            modifier = Modifier
                .size(40.dp)
                .onGloballyPositioned { coordinates ->
                    val bounds = coordinates.boundsInWindow()
                    anchor = Rect(bounds.left.roundToInt(), bounds.top.roundToInt(), bounds.right.roundToInt(), bounds.bottom.roundToInt())
                },
        ) {
            Icon(
                imageVector = if (connected) Icons.Default.CastConnected else Icons.Default.Cast,
                // Joined as React Native joins the header button's label and value: "Cast button, Connected".
                contentDescription = "${viewModel.castButtonLabel}, ${viewModel.castButtonState}",
                tint = if (connected) PlayerAccentColor else Color.White,
            )
        }
        if (viewModel.castPhase == TargetPhase.CONNECTING) {
            CircularProgressIndicator(modifier = Modifier.size(32.dp), strokeWidth = 2.dp, color = Color.White)
        }
    }
}
