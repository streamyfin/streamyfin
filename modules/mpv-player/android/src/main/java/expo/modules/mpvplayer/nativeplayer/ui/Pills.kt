package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.MediaSegmentRecord
import expo.modules.mpvplayer.nativeplayer.NextEpisodeRecord
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import kotlin.math.roundToInt

@Composable
fun SkipSegmentButton(viewModel: PlayerViewModel, segment: MediaSegmentRecord) {
    val label = if (segment.type == "Intro") {
        viewModel.strings.get("skipIntro", "Skip Intro")
    } else {
        viewModel.strings.get("skipCredits", "Skip Credits")
    }

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

@Composable
fun NextEpisodeCountdownView(
    viewModel: PlayerViewModel,
    next: NextEpisodeRecord,
    remaining: Double
) {
    val countdownInt = remaining.roundToInt().coerceAtLeast(1)
    val nextEpisodeLabel = viewModel.strings.get("nextEpisode", "Next Episode")
    val playNowLabel = viewModel.strings.get("playNow", "Play Now")
    val cancelLabel = viewModel.strings.get("cancel", "Cancel")

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(PlayerPillBackground)
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "$nextEpisodeLabel in ${countdownInt}s",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
            }

            Button(
                onClick = { viewModel.playNextEpisodeNow() },
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = Color.Black
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(text = playNowLabel, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }

            Text(
                text = cancelLabel,
                color = Color.White.copy(alpha = 0.7f),
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp,
                modifier = Modifier.clickable { viewModel.cancelNextEpisodeCountdown() }
            )
        }
    }
}

@Composable
fun HoldSpeedPill(speedRate: Double) {
    val label = if (speedRate == 2.0) "2×" else "${speedRate}×"

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(Color.Black.copy(alpha = 0.7f))
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
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
                modifier = Modifier.size(14.dp)
            )
        }
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

@Composable
fun UnlockControlsPill(viewModel: PlayerViewModel) {
    val unlockLabel = viewModel.strings.get("unlock", "Unlock")

    Button(
        onClick = { viewModel.unlockControls() },
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Black.copy(alpha = 0.75f),
            contentColor = Color.White
        ),
        shape = RoundedCornerShape(24.dp),
        modifier = Modifier.padding(16.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Text(text = unlockLabel, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
    }
}
