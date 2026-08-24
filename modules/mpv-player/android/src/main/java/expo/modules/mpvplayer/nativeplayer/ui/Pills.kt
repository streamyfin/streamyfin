package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.MediaSegmentRecord
import expo.modules.mpvplayer.nativeplayer.NextEpisodeRecord
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel

@Composable
fun SkipSegmentButton(viewModel: PlayerViewModel, segment: MediaSegmentRecord) {
    val label = viewModel.skipLabel(segment.type)

    Button(
        onClick = { viewModel.skipActiveSegment() },
        colors = ButtonDefaults.buttonColors(
            containerColor = PlayerPillBackground,
            contentColor = Color.White
        ),
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier.padding(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = label, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Spacer(modifier = Modifier.width(6.dp))
            Icon(
                imageVector = Icons.Default.FastForward,
                contentDescription = null,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

/**
 * "Intro skipped" notice, shown briefly after an automatic skip. It sits at the
 * top centre because the bottom is taken on both sides — title on the left,
 * skip pill and countdown on the right.
 */
@Composable
fun SegmentSkippedNotice(text: String) {
    Text(
        text = text,
        color = Color.White,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .clip(CircleShape)
            .background(PlayerPillBackground)
            .padding(horizontal = 16.dp, vertical = 10.dp)
    )
}

/**
 * Next-episode card shown during the outro. Mirror of iOS
 * NextEpisodeCountdownView: episode still, titles, a countdown ring wrapped
 * around the play button, and an X that cancels until the next stream load.
 */
@Composable
fun NextEpisodeCountdownView(
    viewModel: PlayerViewModel,
    next: NextEpisodeRecord,
    remaining: Double
) {
    val playNowLabel = viewModel.strings.get("playNow", "Play Now")
    val cancelLabel = viewModel.strings.get("cancel", "Cancel")

    val fraction = if (next.countdownSeconds > 0) {
        (remaining / next.countdownSeconds).coerceIn(0.0, 1.0).toFloat()
    } else {
        0f
    }
    // countdownRemaining ticks twice a second — tween the ring across the gap
    // so it sweeps continuously instead of stepping (iOS animates it linearly).
    val ringFraction by animateFloatAsState(
        targetValue = fraction,
        animationSpec = tween(durationMillis = 500, easing = LinearEasing),
        label = "nextEpisodeRing"
    )

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(PlayerPillBackground)
            .border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        next.imageUrl?.takeIf { it.isNotBlank() }?.let { url ->
            RemoteImage(
                url = url,
                modifier = Modifier
                    .width(92.dp)
                    .height(52.dp)
                    .clip(RoundedCornerShape(8.dp))
            )
        }

        Column(
            // weight(fill = false) caps the text at 160dp like iOS but lets it
            // give way first on a narrow portrait window, so the play and X
            // buttons never get squeezed off the card.
            modifier = Modifier
                .weight(1f, fill = false)
                .widthIn(max = 160.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            next.subtitle?.takeIf { it.isNotBlank() }?.let { subtitle ->
                Text(
                    text = subtitle,
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text(
                text = next.title,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }

        // Play button wearing the countdown ring.
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .clickable { viewModel.playNextEpisodeNow() },
            contentAlignment = Alignment.Center
        ) {
            Canvas(modifier = Modifier.size(44.dp)) {
                val strokeWidth = 3.dp.toPx()
                val inset = strokeWidth / 2f
                drawCircle(
                    color = Color.White.copy(alpha = 0.3f),
                    radius = (size.minDimension - strokeWidth) / 2f,
                    style = Stroke(width = strokeWidth)
                )
                drawArc(
                    color = Color.White,
                    startAngle = -90f,
                    sweepAngle = 360f * ringFraction,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = Size(size.width - strokeWidth, size.height - strokeWidth),
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
                )
            }
            Icon(
                imageVector = Icons.Default.PlayArrow,
                contentDescription = playNowLabel,
                tint = Color.White,
                modifier = Modifier.size(22.dp)
            )
        }

        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .clickable { viewModel.cancelNextEpisodeCountdown() },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = cancelLabel,
                tint = Color.White.copy(alpha = 0.8f),
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
fun HoldSpeedPill(speedRate: Double) {
    val label = if (speedRate == 2.0) "2×" else "${speedRate}×"

    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Text(
            text = label,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp
        )
        Icon(
            imageVector = Icons.Default.FastForward,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(12.dp)
        )
    }
}

@Composable
fun DoubleTapSeekPill(forward: Boolean, seconds: Double) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.6f))
            .padding(18.dp)
    ) {
        Icon(
            imageVector = if (forward) Icons.Default.Forward10 else Icons.Default.Replay10,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(36.dp)
        )
    }
}

/** Lock-mode unlock pill — same capsule shape as the 2× pill it shares the top edge with. */
@Composable
fun UnlockControlsPill(viewModel: PlayerViewModel) {
    val unlockLabel = viewModel.strings.get("unlock", "Unlock")

    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.55f))
            .clickable { viewModel.unlockControls() }
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(
            imageVector = Icons.Default.LockOpen,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(14.dp)
        )
        Text(
            text = unlockLabel,
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp
        )
    }
}
