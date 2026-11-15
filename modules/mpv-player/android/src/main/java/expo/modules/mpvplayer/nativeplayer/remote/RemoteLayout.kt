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

    /**
     * The width of the box beside the column. Wide, the artwork's share of the whole width, the one its size is
     * reckoned against; couched the box wraps the artwork, and upright nothing stands beside the column: null.
     */
    fun besideWidth(layout: RemoteLayout, widthDp: Double): Double? =
        if (layout == RemoteLayout.WIDE) widthDp * PlayerConstants.REMOTE_WIDE_ARTWORK_FRACTION else null

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

/** The six slots every layout places (design §3.1). Twin: RemoteSlot in RemoteLayout.swift. */
enum class RemoteSlot { HEADER, ARTWORK, TITLES, BAR, TRANSPORT, BOTTOM_ROW }

/**
 * Where a layout puts the slots: a bar across the top, the slot beside the rest (the artwork, on the left), the
 * column, top to bottom, and a band across the bottom. Couched, the header, the titles and the bottom row's
 * buttons share the top bar and the bar runs along the bottom; wide, the upright column stands beside the artwork.
 * [spaces] are the column's indices where the free height goes, shared equally when the screen is taller than the
 * slots (`column.size`: after the last): upright above the bottom row, as in the mockup; couched and wide around the
 * middle, so the transport sits level with the artwork.
 */
data class RemoteArrangement(
    val topBar: List<RemoteSlot>,
    val beside: RemoteSlot?,
    val column: List<RemoteSlot>,
    val bottom: List<RemoteSlot>,
    val spaces: List<Int>,
) {
    companion object {
        private val upright = listOf(
            RemoteSlot.HEADER, RemoteSlot.ARTWORK, RemoteSlot.TITLES,
            RemoteSlot.BAR, RemoteSlot.TRANSPORT, RemoteSlot.BOTTOM_ROW,
        )

        fun of(layout: RemoteLayout): RemoteArrangement = when (layout) {
            RemoteLayout.PORTRAIT -> RemoteArrangement(emptyList(), null, upright, emptyList(), listOf(upright.size - 1))
            RemoteLayout.LANDSCAPE -> RemoteArrangement(
                topBar = listOf(RemoteSlot.HEADER, RemoteSlot.TITLES, RemoteSlot.BOTTOM_ROW),
                beside = RemoteSlot.ARTWORK,
                column = listOf(RemoteSlot.TRANSPORT),
                bottom = listOf(RemoteSlot.BAR),
                spaces = listOf(0, 1),
            )
            RemoteLayout.WIDE -> (upright - RemoteSlot.ARTWORK).let { column ->
                RemoteArrangement(emptyList(), RemoteSlot.ARTWORK, column, emptyList(), listOf(1, column.size - 1))
            }
        }
    }
}

/** The transport's buttons, the chrome's sizes, and the gap between them: narrower upright, to fit the width. */
data class RemoteTransport(val sideDp: Double, val seekDp: Double, val playDp: Double, val gapDp: Double) {
    companion object {
        fun of(layout: RemoteLayout) = RemoteTransport(
            sideDp = PlayerConstants.REMOTE_BUTTON_SMALL_DP,
            seekDp = PlayerConstants.REMOTE_BUTTON_MEDIUM_DP,
            playDp = PlayerConstants.REMOTE_BUTTON_PLAY_DP,
            gapDp = if (layout == RemoteLayout.PORTRAIT) {
                PlayerConstants.REMOTE_TRANSPORT_GAP_PORTRAIT_DP
            } else {
                PlayerConstants.REMOTE_TRANSPORT_GAP_DP
            },
        )
    }
}

/** What lights up in the active color on the remote screen (design §3.3). */
object RemoteActive {
    /** Subtitles are on when the chosen entry is a real track: "None" is SUBTITLES_OFF, -1, on the JS side. */
    fun subtitlesOn(selectedIndex: Int?): Boolean = selectedIndex != null && selectedIndex >= 0
}
