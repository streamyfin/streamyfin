package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.nativeplayer.PlayerConstants

/**
 * The remote screen's three layouts (design §3.1, §3.2), chosen from the window's size class, never from the
 * device model: a short window is couched, a wide one puts the artwork beside the controls, the rest stands
 * upright. iOS points and Android dp are worth the same here. Twin: RemoteLayout.swift.
 */
enum class RemoteLayout {
    PORTRAIT,
    LANDSCAPE,
    WIDE;

    companion object {
        fun of(widthDp: Double, heightDp: Double): RemoteLayout = when {
            heightDp < PlayerConstants.REMOTE_COMPACT_HEIGHT_DP -> LANDSCAPE
            widthDp >= PlayerConstants.REMOTE_WIDE_MIN_WIDTH_DP -> WIDE
            else -> PORTRAIT
        }
    }
}

/**
 * How big the artwork is: what the rest of the screen leaves once its text is counted at the font scale asked
 * for, between REMOTE_ARTWORK_MIN_DP and REMOTE_ARTWORK_MAX_DP. The artwork gives up its height first; when
 * nothing fits even at its minimum, the column scrolls.
 */
object RemoteMetrics {
    /** The height the rest of the screen takes beside the artwork's, in the same column. */
    fun chromeHeight(layout: RemoteLayout, fontScale: Double): Double = when (layout) {
        RemoteLayout.PORTRAIT ->
            PlayerConstants.REMOTE_PORTRAIT_FIXED_DP + PlayerConstants.REMOTE_PORTRAIT_TEXT_DP * fontScale
        RemoteLayout.LANDSCAPE ->
            PlayerConstants.REMOTE_LANDSCAPE_FIXED_DP + PlayerConstants.REMOTE_LANDSCAPE_TEXT_DP * fontScale
        // Beside the column, the artwork only keeps a margin above and below.
        RemoteLayout.WIDE -> 2 * PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP
    }

    fun artworkHeight(layout: RemoteLayout, widthDp: Double, heightDp: Double, fontScale: Double): Double {
        val byWidth = when (layout) {
            RemoteLayout.PORTRAIT -> widthDp - 2 * PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP
            RemoteLayout.LANDSCAPE -> widthDp * PlayerConstants.REMOTE_LANDSCAPE_ARTWORK_FRACTION
            RemoteLayout.WIDE -> widthDp * PlayerConstants.REMOTE_WIDE_ARTWORK_FRACTION
        }
        val byHeight = heightDp - chromeHeight(layout, fontScale)
        return minOf(byWidth, byHeight)
            .coerceIn(PlayerConstants.REMOTE_ARTWORK_MIN_DP, PlayerConstants.REMOTE_ARTWORK_MAX_DP)
    }
}
