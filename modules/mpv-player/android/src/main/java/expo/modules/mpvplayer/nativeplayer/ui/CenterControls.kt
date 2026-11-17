package expo.modules.mpvplayer.nativeplayer.ui

import expo.modules.mpvplayer.nativeplayer.engine.isRemote
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.remote.RemoteTransport
import kotlin.math.roundToInt

/**
 * The transport's sizes and look. The defaults are the local chrome's; the remote screen passes its own sizes,
 * [disc]: the play button a white disc with a dark icon and its loading ring inside, no scrim behind the others,
 * and [fit]: the row takes the width it is given and its gaps give way when the buttons and their gaps are wider
 * (FittingGapArrangement), where the local chrome's spacedBy squeezes the last button.
 */
data class TransportStyle(
    val side: Dp = 44.dp,
    val seek: Dp = 52.dp,
    val play: Dp = 68.dp,
    val gap: Dp = 28.dp,
    val disc: Boolean = false,
    val fit: Boolean = false,
)

/**
 * Centers the buttons [gap] apart, or closer when the row is narrower than the buttons and their gaps
 * (RemoteTransport.fittingGap). Its spacing is 0 so that the Row measures every button at its size before the gaps
 * are known: a spacing reserved there is what squeezed the last button.
 */
internal class FittingGapArrangement(private val gap: Dp) : Arrangement.Horizontal {
    override val spacing: Dp = 0.dp

    override fun Density.arrange(totalSize: Int, sizes: IntArray, layoutDirection: LayoutDirection, outPositions: IntArray) {
        val buttons = sizes.sum().toDouble()
        val fitted = RemoteTransport.fittingGap(totalSize.toDouble(), buttons, sizes.size, gap.toPx().toDouble())
        var x = ((totalSize - buttons - fitted * (sizes.size - 1)) / 2).coerceAtLeast(0.0)
        sizes.forEachIndexed { index, size ->
            val start = x.roundToInt()
            outPositions[index] = if (layoutDirection == LayoutDirection.Ltr) start else totalSize - start - size
            x += size + fitted
        }
    }
}

/** Media controls keep their left-to-right order in right-to-left languages, seek back on the left, as the
 *  position bar's timeline and the remote artwork's double tap halves do. */
@Composable
fun CenterControls(
    viewModel: PlayerViewModel,
    modifier: Modifier = Modifier,
    style: TransportStyle = TransportStyle(),
    // The remote screen spins from the state of the TV (RemoteScreenModel), not from the engine's loading alone.
    showsSpinner: Boolean = viewModel.isBuffering && !viewModel.isScrubbing && viewModel.errorMessage == null,
    // The remote screen cuts the transport while the session comes back: each button says it disabled to TalkBack.
    enabled: Boolean = true,
    // The reduced remote player has no episodes: neither previous nor next, whatever the view model holds.
    showsPreviousNext: Boolean = true,
) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        CenterControlsContent(viewModel, modifier, style, showsSpinner, enabled, showsPreviousNext)
    }
}

@Composable
private fun CenterControlsContent(
    viewModel: PlayerViewModel,
    modifier: Modifier,
    style: TransportStyle,
    showsSpinner: Boolean,
    enabled: Boolean,
    showsPreviousNext: Boolean,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val scrim = if (style.disc) Color.Transparent else Color.Black.copy(alpha = 0.5f)
    val playInk = if (style.disc) Color.Black else Color.White

    Row(
        modifier = if (style.fit) modifier.fillMaxWidth() else modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = if (style.fit) FittingGapArrangement(style.gap) else Arrangement.spacedBy(style.gap)
    ) {
        // Previous Episode button if episode list exists. A remote screen asks the view model, which restarts the
        // episode or asks JS for the one before: the receiver's queue is not the series.
        val remote = viewModel.engine?.isRemote == true
        val neighbours = if (remote) viewModel.remoteNeighbours else null
        val currentIdx = viewModel.episodeList.indexOfFirst { it.isCurrent }
        val hasPrevious = if (neighbours != null) neighbours.hasPrevious || neighbours.hasNext else currentIdx > 0
        if (showsPreviousNext && hasPrevious) {
            Box(
                modifier = Modifier
                    .size(style.side)
                    .clip(CircleShape)
                    .background(scrim)
                    .clickable(enabled = enabled) {
                        if (remote) {
                            viewModel.remotePrevious()
                        } else {
                            val prevItem = viewModel.episodeList[currentIdx - 1]
                            viewModel.selectEpisode(prevItem.itemId)
                        }
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
                .clickable(enabled = enabled) {
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
                .clickable(enabled = enabled) {
                    viewModel.togglePlayPause()
                },
            contentAlignment = Alignment.Center
        ) {
            if (showsSpinner) {
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
                .clickable(enabled = enabled) {
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
        // On a remote screen the next episode is the list's: nextEpisode is what comes after the list sent.
        val hasNext = neighbours?.hasNext
            ?: ((currentIdx >= 0 && currentIdx < viewModel.episodeList.size - 1) || viewModel.nextEpisode != null)
        if (showsPreviousNext && hasNext) {
            Box(
                modifier = Modifier
                    .size(style.side)
                    .clip(CircleShape)
                    .background(scrim)
                .clickable(enabled = enabled) {
                    if (remote) {
                        viewModel.remoteNext()
                    } else if (viewModel.nextEpisode != null) {
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
