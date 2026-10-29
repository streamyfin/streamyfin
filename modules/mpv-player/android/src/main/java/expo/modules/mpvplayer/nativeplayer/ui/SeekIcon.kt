package expo.modules.mpvplayer.nativeplayer.ui

import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Forward30
import androidx.compose.material.icons.filled.Forward5
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.Replay30
import androidx.compose.material.icons.filled.Replay5
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The whole seconds a skip button shows, or null for a skip time that is not
 * a number. Negative is checked before rounding: -0.4 rounds to -0, which
 * would pass as 0.
 */
internal fun seekCount(seconds: Double): Int? {
    if (!seconds.isFinite() || seconds < 0) return null
    return seconds.roundToInt()
}

/** Material's numbered arrow for exactly [count] seconds, or null when Material has none. */
internal fun numberedSeekIcon(forward: Boolean, count: Int?): ImageVector? = when (count) {
    5 -> if (forward) Icons.Filled.Forward5 else Icons.Filled.Replay5
    10 -> if (forward) Icons.Filled.Forward10 else Icons.Filled.Replay10
    30 -> if (forward) Icons.Filled.Forward30 else Icons.Filled.Replay30
    else -> null
}

// Where Material draws its own digits, in the icons' 24 unit viewport
// (Replay10, Forward10): on the circle's vertical axis, sitting on y = 16,
// the "0" 4.38 units tall. The ring's inner edge leaves about 10 units of
// width at that height.
private const val VIEWPORT = 24f
private const val DIGITS_CENTER_X = 12f
private const val DIGITS_BASELINE = 16f
private const val ZERO_HEIGHT = 4.38f
private const val DIGITS_MAX_WIDTH = 10f

// Glyph bounds come back as whole pixels, so they are measured at a large
// size and scaled down rather than measured at a few pixels tall.
private const val REFERENCE_TEXT_SIZE = 1000f

/**
 * A skip glyph that always shows its number. Material only has numbered
 * arrows for 5, 10 and 30 seconds, so the phone drew the 10 second glyph for
 * every skip time and TV drew a bare arrow for the others. Those now get the
 * plain arrow with the number drawn where Material draws its digits, at the
 * same height and weight. Shared by the phone center controls, the double-tap
 * pill and the TV controls row; the Android side of iOS's SeekGlyph.
 */
@Composable
fun SeekIcon(
    forward: Boolean,
    seconds: Double,
    tint: Color,
    contentDescription: String?,
    modifier: Modifier = Modifier
) {
    val count = seekCount(seconds)
    val numbered = numberedSeekIcon(forward, count)
    if (numbered != null) {
        Icon(imageVector = numbered, contentDescription = contentDescription, modifier = modifier, tint = tint)
        return
    }

    val paint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply { typeface = Typeface.DEFAULT_BOLD }
    }
    Box(modifier) {
        Icon(
            imageVector = Icons.Filled.Replay,
            contentDescription = contentDescription,
            tint = tint,
            // Material has no plain clockwise arrow; Forward10's is Replay10's mirrored.
            modifier = Modifier
                .matchParentSize()
                .graphicsLayer { scaleX = if (forward) -1f else 1f }
        )
        if (count != null) {
            val text = count.toString()
            Canvas(Modifier.matchParentSize()) {
                val unit = size.minDimension / VIEWPORT
                paint.color = tint.toArgb()
                paint.textSize = REFERENCE_TEXT_SIZE
                val zero = Rect().also { paint.getTextBounds("0", 0, 1, it) }
                val ink = Rect().also { paint.getTextBounds(text, 0, text.length, it) }
                // Material's digit height, narrowed for a long number so it stays inside the ring.
                val scale = min(ZERO_HEIGHT * unit / zero.height(), DIGITS_MAX_WIDTH * unit / ink.width())
                paint.textSize = REFERENCE_TEXT_SIZE * scale
                val left = (size.width - VIEWPORT * unit) / 2f + DIGITS_CENTER_X * unit - ink.exactCenterX() * scale
                val baseline = (size.height - VIEWPORT * unit) / 2f + DIGITS_BASELINE * unit
                drawIntoCanvas { it.nativeCanvas.drawText(text, left, baseline, paint) }
            }
        }
    }
}
