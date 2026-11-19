package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import kotlinx.coroutines.delay

/** The panel where the touch players draw it, the local one and the remote screen: centered, clear of the bars. */
@Composable
fun TechnicalInfoLayer(viewModel: PlayerViewModel) {
    if (!viewModel.showTechnicalInfo || !viewModel.capabilities.technicalInfo) return
    Box(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(16.dp),
        contentAlignment = Alignment.Center
    ) {
        // The layers under the card no longer get the touches on it (a double tap on its text seeked): Compose gives
        // a touch to the topmost node that takes one. The remote screen's drag down watches from above and still
        // closes it.
        TechnicalInfoOverlay(
            viewModel = viewModel,
            onDismiss = { viewModel.showTechnicalInfo = false },
            modifier = Modifier.pointerInput(Unit) {},
        )
    }
}

@Composable
fun TechnicalInfoOverlay(
    viewModel: PlayerViewModel,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    // The remote screen's, over the artwork: tighter, and its lines scroll when the artwork is shorter than they are.
    compact: Boolean = false,
    // False when the caller says the panel opened and closed itself: one that moves between slots remounts.
    reportsShown: Boolean = true,
) {
    var techInfo by remember { mutableStateOf<Map<String, Any>>(emptyMap()) }
    val fromJs = viewModel.capabilities.technicalInfoFromJs

    // A remote panel asks JS for its lines while it is shown; a local one reads its engine.
    DisposableEffect(Unit) {
        if (reportsShown) viewModel.technicalInfoShown(true)
        onDispose { if (reportsShown) viewModel.technicalInfoShown(false) }
    }
    LaunchedEffect(fromJs) {
        while (!fromJs) {
            techInfo = viewModel.technicalInfo()
            delay(1000L)
        }
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.Black.copy(alpha = 0.85f))
            .padding(if (compact) 10.dp else 16.dp)
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
                    fontSize = if (compact) 13.sp else 15.sp
                )
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.size(if (compact) 24.dp else 28.dp)
                ) {
                    Icon(Icons.Default.Close, contentDescription = viewModel.strings.get("close", "Close"), tint = Color.White, modifier = Modifier.size(18.dp))
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = if (compact) 4.dp else 8.dp), color = Color.White.copy(alpha = 0.2f))

            if (fromJs) {
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                    viewModel.technicalLines.forEach { (label, value) -> TechInfoRow(label, value, compact) }
                }
            } else {
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
                // Decoder rows are engine-dependent: mpv reports hwdec, the
                // Media3 engine reports decoderName/decoderType. Each engine's
                // page shows its own — the other's keys are simply absent.
                techInfo["hwdec"]?.let { TechInfoRow("Decoder", it.toString()) }
                techInfo["decoderName"]?.let { TechInfoRow("Decoder", it.toString()) }
                techInfo["decoderType"]?.let { TechInfoRow("Decode", it.toString()) }
                techInfo["hdrFormat"]?.let { TechInfoRow("HDR", it.toString()) }
                techInfo["voDriver"]?.let { TechInfoRow("VO Driver", it.toString()) }
                techInfo["cacheSeconds"]?.let { TechInfoRow("Buffer", String.format("%.1f s", it)) }
                techInfo["droppedFrames"]?.let { TechInfoRow("Dropped Frames", it.toString()) }
                techInfo["primaries"]?.let { TechInfoRow("Primaries", it.toString()) }
                techInfo["gamma"]?.let { TechInfoRow("Gamma", it.toString()) }
            }
        }
    }
}

/**
 * How a line shares the panel's width, label then value. Compact, over a narrow artwork, by weight: a long label
 * wraps rather than leave its value a word per line. Otherwise null: the local player's panel and the TV's keep the
 * line they always had.
 */
internal fun techInfoRowWeights(compact: Boolean): Pair<Float, Float>? = if (compact) 0.4f to 0.6f else null

@Composable
private fun TechInfoRow(label: String, value: String, compact: Boolean = false) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = if (compact) 1.dp else 3.dp),
        // Short, the value stands against the right edge; compact and long, it wraps kept apart from its label.
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        // Compact, the line height follows the text: the theme's is 24 sp whatever the size.
        val lineHeight = if (compact) 15.sp else TextUnit.Unspecified
        val weights = techInfoRowWeights(compact)
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.6f),
            fontSize = 12.sp,
            lineHeight = lineHeight,
            modifier = weights?.let { Modifier.weight(it.first, fill = false) } ?: Modifier,
        )
        Text(
            text = value,
            color = Color.White,
            fontSize = 12.sp,
            lineHeight = lineHeight,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Medium,
            textAlign = if (weights != null) TextAlign.End else null,
            modifier = weights?.let { Modifier.weight(it.second).padding(start = 8.dp) } ?: Modifier,
        )
    }
}
