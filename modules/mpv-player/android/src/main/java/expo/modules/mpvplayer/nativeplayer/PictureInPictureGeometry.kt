package expo.modules.mpvplayer.nativeplayer

import android.graphics.Rect
import android.util.Rational

/** Android refuses a PiP window wider than this, or taller than its inverse: setting it throws. */
private const val MAX_PIP_ASPECT = 2.39f

data class PictureInPictureGeometry(
    val aspectRatio: Rational,
    /** Where the picture sits in the player's view, so the window grows out of it, not the bars. */
    val sourceRectHint: Rect?
)

/**
 * The PiP window for a video of this size shown in a view of this size: 16:9 until the size is
 * known, no hint until the view is laid out. Same math as the JS player's PiPController.
 */
fun pictureInPictureGeometry(
    videoWidth: Int,
    videoHeight: Int,
    viewWidth: Int,
    viewHeight: Int
): PictureInPictureGeometry {
    if (videoWidth <= 0 || videoHeight <= 0) return PictureInPictureGeometry(Rational(16, 9), null)
    val aspectRatio = Rational(
        videoWidth.coerceAtMost((videoHeight * MAX_PIP_ASPECT).toInt()),
        videoHeight.coerceAtMost((videoWidth * MAX_PIP_ASPECT).toInt())
    )
    if (viewWidth <= 0 || viewHeight <= 0) return PictureInPictureGeometry(aspectRatio, null)

    val ratio = aspectRatio.toFloat()
    val hint = if (viewWidth.toFloat() / viewHeight < ratio) {
        // Wider than the view: bars above and below.
        val height = (viewWidth / ratio).toInt()
        val top = (viewHeight - height) / 2
        Rect(0, top, viewWidth, top + height)
    } else {
        val width = (viewHeight * ratio).toInt()
        val left = (viewWidth - width) / 2
        Rect(left, 0, left + width, viewHeight)
    }
    return PictureInPictureGeometry(aspectRatio, hint)
}
