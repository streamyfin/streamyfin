package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel

/**
 * The transport's sizes and look. The defaults are the local chrome's; the remote screen passes its own sizes and
 * [disc]: the play button a white disc with a dark icon and its loading ring inside, no scrim behind the others.
 */
data class TransportStyle(
    val side: Dp = 44.dp,
    val seek: Dp = 52.dp,
    val play: Dp = 68.dp,
    val gap: Dp = 28.dp,
    val disc: Boolean = false,
)

@Composable
fun CenterControls(viewModel: PlayerViewModel, modifier: Modifier = Modifier, style: TransportStyle = TransportStyle()) {
    val interactionSource = remember { MutableInteractionSource() }
    val scrim = if (style.disc) Color.Transparent else Color.Black.copy(alpha = 0.5f)
    val playInk = if (style.disc) Color.Black else Color.White

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(style.gap)
    ) {
        // Previous Episode button if episode list exists
        val currentIdx = viewModel.episodeList.indexOfFirst { it.isCurrent }
        val hasPrevious = currentIdx > 0
        if (hasPrevious) {
            Box(
                modifier = Modifier
                    .size(style.side)
                    .clip(CircleShape)
                    .background(scrim)
                    .clickable {
                        val prevItem = viewModel.episodeList[currentIdx - 1]
                        viewModel.selectEpisode(prevItem.itemId)
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.SkipPrevious,
                    contentDescription = "Previous Episode",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }

        // Seek Backward
        Box(
            modifier = Modifier
                .size(style.seek)
                .clip(CircleShape)
                .background(scrim)
                .clickable {
                    viewModel.haptic()
                    viewModel.seekBy(-viewModel.uiOptions.seekBackwardSec)
                },
            contentAlignment = Alignment.Center
        ) {
            SeekIcon(
                forward = false,
                seconds = viewModel.uiOptions.seekBackwardSec,
                tint = Color.White,
                contentDescription = "Seek Backward",
                modifier = Modifier.size(30.dp)
            )
        }

        // Play / Pause main button
        Box(
            modifier = Modifier
                .size(style.play)
                .clip(CircleShape)
                .background(if (style.disc) Color.White else Color.Black.copy(alpha = 0.6f))
                .clickable {
                    viewModel.togglePlayPause()
                },
            contentAlignment = Alignment.Center
        ) {
            if (viewModel.isBuffering && !viewModel.isScrubbing && viewModel.errorMessage == null) {
                CircularProgressIndicator(
                    color = playInk,
                    modifier = Modifier.size(36.dp),
                    strokeWidth = 3.dp
                )
            } else {
                Icon(
                    imageVector = if (viewModel.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (viewModel.isPlaying) "Pause" else "Play",
                    tint = playInk,
                    modifier = Modifier.size(42.dp)
                )
            }
        }

        // Seek Forward
        Box(
            modifier = Modifier
                .size(style.seek)
                .clip(CircleShape)
                .background(scrim)
                .clickable {
                    viewModel.haptic()
                    viewModel.seekBy(viewModel.uiOptions.seekForwardSec)
                },
            contentAlignment = Alignment.Center
        ) {
            SeekIcon(
                forward = true,
                seconds = viewModel.uiOptions.seekForwardSec,
                tint = Color.White,
                contentDescription = "Seek Forward",
                modifier = Modifier.size(30.dp)
            )
        }

        // Next Episode button
        val hasNext = (currentIdx >= 0 && currentIdx < viewModel.episodeList.size - 1) || viewModel.nextEpisode != null
        if (hasNext) {
            Box(
                modifier = Modifier
                    .size(style.side)
                    .clip(CircleShape)
                    .background(scrim)
                .clickable {
                    if (viewModel.nextEpisode != null) {
                        viewModel.playNextEpisodeNow()
                    } else if (currentIdx >= 0 && currentIdx < viewModel.episodeList.size - 1) {
                        val nextItem = viewModel.episodeList[currentIdx + 1]
                        viewModel.selectEpisode(nextItem.itemId)
                    }
                },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.SkipNext,
                    contentDescription = "Next Episode",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}
