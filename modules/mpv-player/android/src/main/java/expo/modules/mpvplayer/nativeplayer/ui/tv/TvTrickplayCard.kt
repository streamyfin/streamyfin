package expo.modules.mpvplayer.nativeplayer.ui.tv

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import expo.modules.mpvplayer.nativeplayer.TrickplayProvider
import expo.modules.mpvplayer.nativeplayer.ui.formatTimeSec

@Composable
fun TvTrickplayCard(
    provider: TrickplayProvider,
    positionSec: Double,
    modifier: Modifier = Modifier
) {
    var imageBitmap by remember { mutableStateOf<Bitmap?>(null) }
    val tileIndex = remember(positionSec) { provider.tileIndex(positionSec) }

    LaunchedEffect(tileIndex) {
        val next = provider.thumbnail(positionSec)
        if (next != null) {
            imageBitmap = next
        }
    }

    val shape = RoundedCornerShape(TvMetrics.RADIUS_PANEL)
    Box(
        modifier = modifier
            .size(TvMetrics.POSTER_WIDTH, TvMetrics.POSTER_HEIGHT)
            .clip(shape)
            .background(TvPalette.SurfaceGlassStrong),
        contentAlignment = Alignment.BottomStart
    ) {
        val bmp = imageBitmap
        if (bmp != null) {
            Image(
                bitmap = bmp.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        }

        TvPosterScrim(modifier = Modifier.align(Alignment.BottomCenter))

        // Hairline drawn over the thumbnail so the edge catch-light survives.
        Box(
            modifier = Modifier
                .matchParentSize()
                .border(1.dp, TvPalette.Hairline, shape)
        )

        Text(
            text = formatTimeSec(positionSec),
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.padding(
                horizontal = TvMetrics.TEXT_INSET_H,
                vertical = TvMetrics.TEXT_INSET_V
            )
        )
    }
}
