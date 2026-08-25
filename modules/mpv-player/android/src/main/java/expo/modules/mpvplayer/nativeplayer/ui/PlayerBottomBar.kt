package expo.modules.mpvplayer.nativeplayer.ui

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

@Composable
fun PlayerBottomBar(
    viewModel: PlayerViewModel,
    modifier: Modifier = Modifier
) {
    val duration = viewModel.duration
    val position = if (viewModel.isScrubbing) viewModel.scrubPosition else viewModel.displayPosition
    val progress = if (duration > 0) (position / duration).coerceIn(0.0, 1.0) else 0.0
    val cacheProgress = if (duration > 0) ((position + viewModel.cacheSeconds) / duration).coerceIn(0.0, 1.0) else 0.0

    // Find current chapter
    val currentChapter = viewModel.chapters.lastOrNull { position >= it.startSec }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        // Chapter name on the left above the scrubber
        currentChapter?.name?.let { chName ->
            Text(
                text = chName,
                color = Color.White.copy(alpha = 0.75f),
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(bottom = 6.dp)
            )
        }

        // Scrubber with time labels
        ScrubberBar(
            viewModel = viewModel,
            progress = progress,
            cacheProgress = cacheProgress,
            position = position,
            duration = duration
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Time labels & ends-at
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Elapsed
            Text(
                text = formatTimeSec(position),
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )

            Spacer(modifier = Modifier.weight(1f))

            // Duration & Ends at
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (duration > 0 && position < duration) {
                    val endsAt = calculateEndsAt(duration - position)
                    Text(
                        text = viewModel.strings.formatEndsAt(endsAt),
                        color = Color.White.copy(alpha = 0.6f),
                        fontSize = 11.sp
                    )
                }

                Text(
                    text = formatTimeSec(duration),
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
private fun ScrubberBar(
    viewModel: PlayerViewModel,
    progress: Double,
    cacheProgress: Double,
    position: Double,
    duration: Double
) {
    var previewThumbnail by remember { mutableStateOf<Bitmap?>(null) }
    val currentTileIndex = if (viewModel.isScrubbing) viewModel.trickplay?.tileIndex(position) else null

    LaunchedEffect(viewModel.isScrubbing, currentTileIndex) {
        if (viewModel.isScrubbing && currentTileIndex != null && viewModel.trickplay != null) {
            previewThumbnail = viewModel.trickplay?.thumbnail(position)
        } else if (!viewModel.isScrubbing) {
            previewThumbnail = null
        }
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .height(36.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        val totalWidthPx = constraints.maxWidth.toFloat()

        // Trickplay Preview Bubble (above scrubber)
        if (viewModel.isScrubbing && previewThumbnail != null) {
            val density = LocalDensity.current
            val thumbX = (progress * totalWidthPx).toFloat()

            // Width follows the trickplay thumbnail's own aspect (iOS parity),
            // so 4:3 and 2.39:1 sources aren't cropped into a 16:9 box.
            val bubbleHeight = 84.dp
            val thumbAspect = (viewModel.trickplay?.aspectRatio ?: (16.0 / 9.0))
                .takeIf { it.isFinite() && it > 0.0 }
                ?.coerceIn(1.0, 2.5) ?: (16.0 / 9.0)
            val bubbleWidth = (bubbleHeight.value * thumbAspect).dp
            val bubbleWidthPx = with(density) { bubbleWidth.toPx() }
            val bubbleHeightPx = with(density) { bubbleHeight.toPx() }
            val currentChapterAtScrub = viewModel.chapters.lastOrNull { position >= it.startSec }

            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .offset {
                        val offsetXPx = (thumbX - bubbleWidthPx / 2f).coerceIn(0f, (totalWidthPx - bubbleWidthPx).coerceAtLeast(0f))
                        val offsetYPx = -(bubbleHeightPx / 2f + with(density) { 18.dp.toPx() + 8.dp.toPx() })
                        IntOffset(offsetXPx.roundToInt(), offsetYPx.roundToInt())
                    }
                    // requiredSize, not size: the bubble is drawn outside this
                    // 36dp-tall BoxWithConstraints, and size() coerces into the
                    // incoming constraints — which squashed it to 36dp tall.
                    .requiredSize(bubbleWidth, bubbleHeight)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF1E1E1E))
                    .border(1.dp, Color.White.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
            ) {
                previewThumbnail?.let { bmp ->
                    Image(
                        bitmap = bmp.asImageBitmap(),
                        contentDescription = "Scrub Preview",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                }

                // Bottom gradient scrim for text readability
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .height(36.dp)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f))
                            )
                        )
                )

                // Chapter & Time Overlay in bottom-left
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(horizontal = 6.dp, vertical = 4.dp)
                ) {
                    currentChapterAtScrub?.name?.let { chName ->
                        Text(
                            text = chName,
                            color = Color.White.copy(alpha = 0.85f),
                            fontSize = 9.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Text(
                        text = formatTimeSec(position),
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // Scrubber Track
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(PlayerTrackBackground)
                .pointerInput(duration) {
                    detectTapGestures { offset ->
                        if (duration > 0) {
                            val fraction = (offset.x / totalWidthPx).coerceIn(0f, 1f)
                            viewModel.seekTo(fraction * duration)
                        }
                    }
                }
                .pointerInput(duration) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            viewModel.startScrubbing()
                            if (duration > 0) {
                                val fraction = (offset.x / totalWidthPx).coerceIn(0f, 1f)
                                viewModel.updateScrub(fraction * duration)
                            }
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            if (duration > 0) {
                                val fraction = (change.position.x / totalWidthPx).coerceIn(0f, 1f)
                                viewModel.updateScrub(fraction * duration)
                            }
                        },
                        onDragEnd = {
                            viewModel.finishScrubbing(viewModel.scrubPosition)
                        },
                        onDragCancel = {
                            viewModel.finishScrubbing(viewModel.scrubPosition)
                        }
                    )
                }
        ) {
            // Buffer bar
            Box(
                modifier = Modifier
                    .fillMaxWidth(cacheProgress.toFloat())
                    .fillMaxHeight()
                    .background(PlayerBufferTrack)
            )

            // Progress bar
            Box(
                modifier = Modifier
                    .fillMaxWidth(progress.toFloat())
                    .fillMaxHeight()
                    .background(PlayerProgressTrack)
            )

            // Chapter ticks
            if (duration > 0) {
                viewModel.chapters.forEach { ch ->
                    val chFraction = (ch.startSec / duration).coerceIn(0.0, 1.0).toFloat()
                    if (chFraction > 0.01f && chFraction < 0.99f) {
                        Box(
                            modifier = Modifier
                                .offset { IntOffset((chFraction * totalWidthPx).roundToInt(), 0) }
                                .width(2.dp)
                                .fillMaxHeight()
                                .background(Color.Black.copy(alpha = 0.6f))
                        )
                    }
                }
            }
        }

        // Thumb indicator
        val thumbRadius = if (viewModel.isScrubbing) 8.dp else 6.dp
        val density = LocalDensity.current
        val thumbRadiusPx = with(density) { thumbRadius.toPx() }
        Box(
            modifier = Modifier
                .offset {
                    val thumbXPx = (progress * totalWidthPx).toFloat() - thumbRadiusPx
                    IntOffset(thumbXPx.roundToInt(), 0)
                }
                .size(thumbRadius * 2)
                .clip(CircleShape)
                .background(Color.White)
        )
    }
}

private fun calculateEndsAt(remainingSecs: Double): String {
    val endsAtMillis = System.currentTimeMillis() + (remainingSecs * 1000L).toLong()
    val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())
    return timeFormat.format(Date(endsAtMillis))
}
