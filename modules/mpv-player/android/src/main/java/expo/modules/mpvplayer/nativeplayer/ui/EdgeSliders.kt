package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BrightnessHigh
import androidx.compose.material.icons.filled.BrightnessLow
import androidx.compose.material.icons.filled.VolumeMute
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import expo.modules.mpvplayer.nativeplayer.BrightnessController
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.SystemVolumeController

@Composable
fun BrightnessSliderView(viewModel: PlayerViewModel, controller: BrightnessController?) {
    val level = controller?.brightness ?: 0.5f

    Box(
        modifier = Modifier
            .width(36.dp)
            .height(180.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(PlayerPillBackground),
        contentAlignment = Alignment.BottomCenter
    ) {
        // Fill level
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(level.coerceIn(0.0f, 1.0f))
                .clip(RoundedCornerShape(18.dp))
                .background(Color.White.copy(alpha = 0.35f))
        )

        // Bottom Icon
        Column(
            modifier = Modifier.padding(bottom = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = if (level > 0.5f) Icons.Default.BrightnessHigh else Icons.Default.BrightnessLow,
                contentDescription = "Brightness",
                tint = Color.White,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
fun VolumeSliderView(viewModel: PlayerViewModel, controller: SystemVolumeController?) {
    val level = controller?.volume ?: 0.5f

    Box(
        modifier = Modifier
            .width(36.dp)
            .height(180.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(PlayerPillBackground),
        contentAlignment = Alignment.BottomCenter
    ) {
        // Fill level
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(level.coerceIn(0.0f, 1.0f))
                .clip(RoundedCornerShape(18.dp))
                .background(Color.White.copy(alpha = 0.35f))
        )

        // Bottom Icon
        Column(
            modifier = Modifier.padding(bottom = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            val icon = when {
                level <= 0.001f -> Icons.Default.VolumeOff
                level < 0.4f -> Icons.Default.VolumeMute
                else -> Icons.Default.VolumeUp
            }
            Icon(
                imageVector = icon,
                contentDescription = "Volume",
                tint = Color.White,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}
