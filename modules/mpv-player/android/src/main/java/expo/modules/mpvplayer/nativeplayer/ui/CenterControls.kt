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
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
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
import androidx.compose.ui.unit.dp
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel

@Composable
fun CenterControls(viewModel: PlayerViewModel, modifier: Modifier = Modifier) {
    val interactionSource = remember { MutableInteractionSource() }

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(28.dp)
    ) {
        // Previous Episode button if episode list exists
        val currentIdx = viewModel.episodeList.indexOfFirst { it.isCurrent }
        val hasPrevious = currentIdx > 0
        if (hasPrevious) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.5f))
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

        // Seek Backward (-10s)
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.5f))
                .clickable {
                    viewModel.haptic()
                    viewModel.seekBy(-viewModel.uiOptions.seekBackwardSec)
                },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Replay10,
                contentDescription = "Seek Backward",
                tint = Color.White,
                modifier = Modifier.size(30.dp)
            )
        }

        // Play / Pause main button
        Box(
            modifier = Modifier
                .size(68.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.6f))
                .clickable {
                    viewModel.togglePlayPause()
                },
            contentAlignment = Alignment.Center
        ) {
            if (viewModel.isBuffering && !viewModel.isScrubbing && viewModel.errorMessage == null) {
                CircularProgressIndicator(
                    color = Color.White,
                    modifier = Modifier.size(36.dp),
                    strokeWidth = 3.dp
                )
            } else {
                Icon(
                    imageVector = if (viewModel.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (viewModel.isPlaying) "Pause" else "Play",
                    tint = Color.White,
                    modifier = Modifier.size(42.dp)
                )
            }
        }

        // Seek Forward (+10s)
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.5f))
                .clickable {
                    viewModel.haptic()
                    viewModel.seekBy(viewModel.uiOptions.seekForwardSec)
                },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Forward10,
                contentDescription = "Seek Forward",
                tint = Color.White,
                modifier = Modifier.size(30.dp)
            )
        }

        // Next Episode button
        val hasNext = (currentIdx >= 0 && currentIdx < viewModel.episodeList.size - 1) || viewModel.nextEpisode != null
        if (hasNext) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.5f))
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
