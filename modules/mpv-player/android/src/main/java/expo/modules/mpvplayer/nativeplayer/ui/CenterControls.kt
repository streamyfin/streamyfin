package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Forward30
import androidx.compose.material.icons.filled.Forward5
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.Replay30
import androidx.compose.material.icons.filled.Replay5
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

        // The glyph and accessibility label use the configured seek step.
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
            SeekStepIcon(viewModel.uiOptions.seekBackwardSec, forward = false)
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

        // Seek forward by the configured step.
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
            SeekStepIcon(viewModel.uiOptions.seekForwardSec, forward = true)
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

@Composable
private fun SeekStepIcon(seconds: Double, forward: Boolean) {
    val amount = seconds.toString().removeSuffix(".0")
    val numbered = seconds == 5.0 || seconds == 10.0 || seconds == 30.0
    val icon = when (seconds) {
        5.0 -> if (forward) Icons.Default.Forward5 else Icons.Default.Replay5
        10.0 -> if (forward) Icons.Default.Forward10 else Icons.Default.Replay10
        30.0 -> if (forward) Icons.Default.Forward30 else Icons.Default.Replay30
        else -> if (forward) Icons.Default.FastForward else Icons.Default.Replay
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            imageVector = icon,
            contentDescription = "Seek ${if (forward) "forward" else "backward"} $amount seconds",
            tint = Color.White,
            modifier = Modifier.size(if (numbered) 30.dp else 24.dp)
        )
        if (!numbered) Text("${amount}s", color = Color.White, fontSize = 10.sp)
    }
}
