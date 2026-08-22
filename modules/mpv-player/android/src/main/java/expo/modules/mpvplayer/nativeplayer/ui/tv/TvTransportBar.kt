package expo.modules.mpvplayer.nativeplayer.ui.tv

import android.view.KeyEvent
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Surface
import androidx.tv.material3.SurfaceDefaults
import androidx.tv.material3.Text
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.ui.formatTimeSec
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

@Composable
fun TvTransportBar(
    viewModel: PlayerViewModel,
    modifier: Modifier = Modifier
) {
    val isScrubbing = viewModel.isScrubbing
    val position = if (isScrubbing) viewModel.scrubPosition else viewModel.displayPosition
    val duration = viewModel.duration
    val remaining = max(0.0, duration - position)
    var isBarFocused by remember { mutableStateOf(false) }

    val trackHeight by animateDpAsState(
        targetValue = if (isScrubbing || isBarFocused) 14.dp else 10.dp,
        label = "trackHeight"
    )

    val isFocusable = viewModel.controlsVisible &&
            !isScrubbing &&
            !viewModel.showEpisodeList &&
            !viewModel.showStillWatching &&
            !viewModel.showExitConfirmation &&
            viewModel.tvMenuRoute.isEmpty()

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // 1. Focusable Progress Bar Row. The tv-material3 Surface clips its
        // children to the focus shape (graphicsLayer clip + Offscreen
        // compositing), so the floating trickplay card renders as a sibling
        // of the Surface in this wrapper instead of inside it.
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val barWidthPx = constraints.maxWidth.toFloat()

            Surface(
                onClick = {
                    if (viewModel.controlsVisible && !isScrubbing) {
                        viewModel.togglePlayPause()
                    }
                },
                enabled = isFocusable,
                shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(8.dp)),
                // No focus zoom: the default focusedScale of 1.1 makes the
                // whole bar rescale when scrubbing starts (focus is evicted
                // as the Surface disables). Focus is shown by border + track
                // thickness instead.
                scale = ClickableSurfaceDefaults.scale(
                    scale = 1f,
                    focusedScale = 1f,
                    pressedScale = 1f
                ),
                colors = ClickableSurfaceDefaults.colors(
                    containerColor = Color.Transparent,
                    focusedContainerColor = Color.Transparent
                ),
                border = ClickableSurfaceDefaults.border(
                    focusedBorder = Border(
                        border = androidx.compose.foundation.BorderStroke(2.dp, Color.White.copy(alpha = 0.4f)),
                        shape = RoundedCornerShape(8.dp)
                    )
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .onFocusChanged {
                        isBarFocused = it.isFocused
                        if (it.isFocused) {
                            viewModel.scheduleAutoHide()
                        }
                    }
                    .onPreviewKeyEvent { keyEvent ->
                        if (keyEvent.nativeKeyEvent.action == KeyEvent.ACTION_DOWN) {
                            when (keyEvent.nativeKeyEvent.keyCode) {
                                KeyEvent.KEYCODE_DPAD_LEFT -> {
                                    if (viewModel.controlsVisible && !isScrubbing) {
                                        if (viewModel.isReadyToSeek && duration > 0 && viewModel.errorMessage == null) {
                                            viewModel.beginScrub()
                                            viewModel.nudgeScrub(-viewModel.uiOptions.seekBackwardSec)
                                            return@onPreviewKeyEvent true
                                        }
                                    }
                                }
                                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                                    if (viewModel.controlsVisible && !isScrubbing) {
                                        if (viewModel.isReadyToSeek && duration > 0 && viewModel.errorMessage == null) {
                                            viewModel.beginScrub()
                                            viewModel.nudgeScrub(viewModel.uiOptions.seekForwardSec)
                                            return@onPreviewKeyEvent true
                                        }
                                    }
                                }
                            }
                        }
                        false
                    }
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp, horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Play/Pause/Scrub Glyph
                    val glyph = when {
                        isScrubbing -> Icons.Filled.FastRewind
                        viewModel.isPlaying -> Icons.Filled.PlayArrow
                        else -> Icons.Filled.Pause
                    }
                    Icon(
                        imageVector = glyph,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )

                    // Track and Chapter Ticks
                    BoxWithConstraints(
                        modifier = Modifier
                            .weight(1f)
                            .height(trackHeight)
                    ) {
                        val trackWidthPx = constraints.maxWidth.toFloat()
                        val playedFraction = if (duration > 0) (position / duration).coerceIn(0.0, 1.0).toFloat() else 0f
                        val bufferedFraction = if (duration > 0) {
                            ((viewModel.displayPosition + viewModel.cacheSeconds) / duration).coerceIn(0.0, 1.0).toFloat()
                        } else 0f

                        // Background track
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(trackHeight)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.25f))
                        ) {
                            // Buffered track
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(bufferedFraction)
                                    .height(trackHeight)
                                    .clip(CircleShape)
                                    .background(Color.White.copy(alpha = 0.45f))
                            )

                            // Played track
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(playedFraction)
                                    .height(trackHeight)
                                    .clip(CircleShape)
                                    .background(Color.White)
                            )

                            // Chapter tick marks
                            if (duration > 0) {
                                viewModel.chapters.forEach { chapter ->
                                    if (chapter.startSec > 0) {
                                        val tickFraction = (chapter.startSec / duration).coerceIn(0.0, 1.0).toFloat()
                                        val tickOffsetPx = (trackWidthPx * tickFraction) - 1.5f
                                        Box(
                                            modifier = Modifier
                                                .offset { IntOffset(tickOffsetPx.roundToInt(), 0) }
                                                .width(3.dp)
                                                .height(trackHeight)
                                                .background(Color.Black.copy(alpha = 0.6f))
                                        )
                                    }
                                }
                            }
                        }

                    }
                }
            }

            // Floating trickplay card above the scrub position. Also shown
            // during the seek-feedback flash (hidden-chrome left/right skips),
            // where `position` is the freshly sought displayPosition.
            if (
                (isScrubbing || viewModel.seekFeedbackVisible) &&
                viewModel.trickplay?.isAvailable == true
            ) {
                val density = LocalDensity.current
                // Track geometry inside the Surface row: 4.dp row padding +
                // 24.dp glyph + 16.dp spacing to the left of the track, 4.dp
                // to its right (the time-labels row hardcodes the same 44.dp).
                val trackStartPx = with(density) { 44.dp.toPx() }
                val trackEndPx = barWidthPx - with(density) { 4.dp.toPx() }
                val trackSpanPx = max(0f, trackEndPx - trackStartPx)
                val cardWidthPx = with(density) { TvMetrics.POSTER_WIDTH.toPx() }
                val playedFraction =
                    if (duration > 0) (position / duration).coerceIn(0.0, 1.0).toFloat() else 0f
                val thumbCenterPx = trackStartPx + trackSpanPx * playedFraction
                val cardLeftPx = (thumbCenterPx - cardWidthPx / 2f)
                    .coerceIn(trackStartPx, max(trackStartPx, trackEndPx - cardWidthPx))

                // Measure the card unconstrained but report zero size — the
                // floating card must never inflate the bar's own layout box,
                // or the whole bar jumps up by the poster height on scrub.
                Box(
                    modifier = Modifier.layout { measurable, _ ->
                        val placeable = measurable.measure(Constraints())
                        val cardTopPx = -(TvMetrics.POSTER_HEIGHT + 32.dp).roundToPx()
                        layout(0, 0) {
                            placeable.place(cardLeftPx.roundToInt(), cardTopPx)
                        }
                    }
                ) {
                    TvTrickplayCard(
                        provider = viewModel.trickplay!!,
                        positionSec = position
                    )
                }
            }
        }

        // 2. Time Labels Row (Elapsed + Chapter name left, Remaining + Ends at right)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 44.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            // Left: Elapsed time + chapter name
            Column(horizontalAlignment = Alignment.Start) {
                Text(
                    text = formatTimeSec(position),
                    color = Color.White.copy(alpha = 0.9f),
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace
                )

                val chName = viewModel.chapterName(position)
                if (!chName.isNullOrBlank()) {
                    Text(
                        text = chName,
                        color = Color.White.copy(alpha = 0.55f),
                        fontSize = 16.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // Right: -Remaining time + Ends at HH:mm
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "-${formatTimeSec(remaining)}",
                    color = Color.White.copy(alpha = 0.9f),
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace
                )

                if (duration > 0) {
                    val endsAtText = endsAtLabel(viewModel, remaining)
                    Text(
                        text = endsAtText,
                        color = Color.White.copy(alpha = 0.55f),
                        fontSize = 16.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }
    }
}

private fun endsAtLabel(viewModel: PlayerViewModel, remainingSec: Double): String {
    val endsAtMillis = System.currentTimeMillis() + (remainingSec * 1000).toLong()
    val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
    val timeFormatted = sdf.format(Date(endsAtMillis))
    return viewModel.strings.formatEndsAt(timeFormatted)
}
