package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import kotlinx.coroutines.delay

@Composable
fun TechnicalInfoOverlay(
    viewModel: PlayerViewModel,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    var techInfo by remember { mutableStateOf<Map<String, Any>>(emptyMap()) }

    LaunchedEffect(Unit) {
        while (true) {
            techInfo = viewModel.renderer?.getTechnicalInfo() ?: emptyMap()
            delay(1000L)
        }
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.Black.copy(alpha = 0.85f))
            .padding(16.dp)
            .width(320.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = viewModel.strings.get("technicalInfo", "Technical Info"),
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White, modifier = Modifier.size(18.dp))
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), color = Color.White.copy(alpha = 0.2f))

            TechInfoRow("Video Codec", techInfo["videoCodec"]?.toString() ?: "N/A")
            val w = techInfo["videoWidth"]
            val h = techInfo["videoHeight"]
            if (w != null && h != null) {
                TechInfoRow("Resolution", "${w}x${h}")
            }
            techInfo["fps"]?.let { TechInfoRow("FPS", String.format("%.2f", it)) }
            techInfo["estimatedVfFps"]?.let { TechInfoRow("Render FPS", String.format("%.2f", it)) }
            techInfo["videoBitrate"]?.let { TechInfoRow("Video Bitrate", "${(it as Number).toInt() / 1000} kbps") }
            techInfo["audioCodec"]?.let { TechInfoRow("Audio Codec", it.toString()) }
            techInfo["audioBitrate"]?.let { TechInfoRow("Audio Bitrate", "${(it as Number).toInt() / 1000} kbps") }
            techInfo["hwdec"]?.let { TechInfoRow("Decoder", it.toString()) }
            techInfo["voDriver"]?.let { TechInfoRow("VO Driver", it.toString()) }
            techInfo["cacheSeconds"]?.let { TechInfoRow("Buffer", String.format("%.1f s", it)) }
            techInfo["droppedFrames"]?.let { TechInfoRow("Dropped Frames", it.toString()) }
            techInfo["primaries"]?.let { TechInfoRow("Primaries", it.toString()) }
            techInfo["gamma"]?.let { TechInfoRow("Gamma", it.toString()) }
        }
    }
}

@Composable
private fun TechInfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
        Text(text = value, color = Color.White, fontSize = 12.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium)
    }
}
