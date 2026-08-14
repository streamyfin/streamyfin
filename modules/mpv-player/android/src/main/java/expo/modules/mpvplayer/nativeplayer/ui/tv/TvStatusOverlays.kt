package expo.modules.mpvplayer.nativeplayer.ui.tv

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import expo.modules.mpvplayer.nativeplayer.MediaSegmentRecord
import expo.modules.mpvplayer.nativeplayer.NextEpisodeRecord
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.ui.RemoteImage
import expo.modules.mpvplayer.nativeplayer.ui.TechnicalInfoOverlay

@Composable
fun TvStatusOverlays(
    viewModel: PlayerViewModel,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier.fillMaxSize()) {
        // 1. Buffering Spinner
        if (viewModel.isBuffering && viewModel.errorMessage == null) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 4.dp,
                modifier = Modifier
                    .size(56.dp)
                    .align(Alignment.Center)
            )
        }

        // 2. Technical Info Overlay (top-left, scaled 1.5x)
        if (viewModel.showTechnicalInfo) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(start = TvMetrics.INSET_H, top = TvMetrics.INSET_V)
                    .graphicsLayer(
                        scaleX = 1.5f,
                        scaleY = 1.5f,
                        transformOrigin = TransformOrigin(0f, 0f)
                    )
            ) {
                TechnicalInfoOverlay(
                    viewModel = viewModel,
                    onDismiss = { viewModel.showTechnicalInfo = false }
                )
            }
        }

        // 3. Skip Pill / Next Episode Countdown (bottom-right when chrome hidden)
        val showFloatingPrompt = !viewModel.controlsVisible &&
                !viewModel.showEpisodeList &&
                !viewModel.showSubtitleSearch &&
                viewModel.tvMenuRoute.isEmpty() &&
                !viewModel.showStillWatching &&
                !viewModel.showExitConfirmation

        AnimatedVisibility(
            visible = showFloatingPrompt,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = TvMetrics.INSET_H, bottom = TvMetrics.FLOATING_BOTTOM_INSET)
        ) {
            val countdown = viewModel.countdownRemaining
            val next = viewModel.nextEpisode
            val segment = viewModel.activeSegment

            if (countdown != null && next != null) {
                TvCountdownCard(
                    viewModel = viewModel,
                    next = next,
                    remaining = countdown
                )
            } else if (segment != null && !viewModel.isScrubbing) {
                TvSkipPill(
                    viewModel = viewModel,
                    segment = segment
                )
            }
        }
    }
}

@Composable
fun TvSkipPill(
    viewModel: PlayerViewModel,
    segment: MediaSegmentRecord,
    modifier: Modifier = Modifier
) {
    val text = if (segment.type == "Intro") {
        viewModel.str("skipIntro", "Skip Intro")
    } else {
        viewModel.str("skipCredits", "Skip Credits")
    }

    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(Color(0xFF242424).copy(alpha = 0.92f))
            .padding(horizontal = 26.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = Color.White,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
fun TvCountdownCard(
    viewModel: PlayerViewModel,
    next: NextEpisodeRecord,
    remaining: Double,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .widthIn(max = 580.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Color(0xFF1E1E1E).copy(alpha = 0.94f))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (!next.imageUrl.isNullOrBlank()) {
            RemoteImage(
                url = next.imageUrl,
                modifier = Modifier
                    .size(width = 168.dp, height = 94.dp)
                    .clip(RoundedCornerShape(10.dp))
            )
            Spacer(modifier = Modifier.width(16.dp))
        }

        Column(modifier = Modifier.weight(1f, fill = false)) {
            Text(
                text = "${viewModel.str("nextEpisode", "Next episode")} · ${remaining.toInt()}s",
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 14.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = next.title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (!next.subtitle.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = next.subtitle ?: "",
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}
