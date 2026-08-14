package expo.modules.mpvplayer.nativeplayer.ui.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object TvMetrics {
    val INSET_H = 48.dp
    val INSET_V = 27.dp
    val FLOATING_BOTTOM_INSET = 47.dp

    val POSTER_WIDTH = 300.dp
    val POSTER_HEIGHT = 168.dp
    val POSTER_CORNER = 12.dp

    val SCRIM_HEIGHT = 110.dp
    val TEXT_INSET_H = 14.dp
    val TEXT_INSET_V = 12.dp
}

@Composable
fun TvPosterScrim(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(TvMetrics.SCRIM_HEIGHT)
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color.Black.copy(alpha = 0f),
                        Color.Black.copy(alpha = 0.55f),
                        Color.Black.copy(alpha = 0.85f)
                    )
                )
            )
    )
}
