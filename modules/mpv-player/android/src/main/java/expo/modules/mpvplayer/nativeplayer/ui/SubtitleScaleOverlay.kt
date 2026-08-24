package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

@Composable
fun SubtitleScaleOverlay(viewModel: PlayerViewModel) {
    LaunchedEffect(viewModel.subtitleScaleOverlayActivity) {
        delay(5_000)
        viewModel.showSubtitleScaleOverlay = false
        viewModel.scheduleAutoHide()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTapGestures {
                    viewModel.subtitleScaleOverlayActivity++
                    viewModel.controlsVisible = false
                }
            }
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(24.dp),
        contentAlignment = if (viewModel.subtitlesAtTop) Alignment.BottomCenter else Alignment.TopCenter
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 520.dp)
                .fillMaxWidth()
                .background(Color(0xF21C1C1E), RoundedCornerShape(18.dp))
                .pointerInput(Unit) { detectTapGestures { } }
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = viewModel.str("subtitleSize", "Subtitle Size"),
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold
                )
                IconButton(
                    onClick = {
                        viewModel.showSubtitleScaleOverlay = false
                        viewModel.scheduleAutoHide()
                    }
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = viewModel.str("close", "Close"),
                        tint = Color.White
                    )
                }
            }

            Text(
                text = "${viewModel.subtitleScale}×",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold
            )

            Slider(
                value = viewModel.subtitleScale.toFloat(),
                onValueChange = { value ->
                    viewModel.setSubtitleScale((value * 10).roundToInt() / 10.0)
                },
                valueRange = 0.1f..3.0f,
                steps = 28
            )

            TextButton(
                onClick = { viewModel.setSubtitleScale(1.0) },
                modifier = Modifier.align(Alignment.End)
            ) {
                Text(viewModel.str("reset", "Reset"))
            }
        }
    }
}
