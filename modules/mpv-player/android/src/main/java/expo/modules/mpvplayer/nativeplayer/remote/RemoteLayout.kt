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
            // Centered in its share, with the side margin on each side: the whole share put it against the titles.
            RemoteLayout.WIDE ->
                widthDp * PlayerConstants.REMOTE_WIDE_ARTWORK_FRACTION - 2 * PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP
        }
        val byHeight = heightDp - chromeHeight(layout, fontScale)
        return minOf(byWidth, byHeight)
            .coerceIn(PlayerConstants.REMOTE_ARTWORK_MIN_DP, PlayerConstants.REMOTE_ARTWORK_MAX_DP)
    }
}

/**
 * The remote screen's colors, ARGB, from the tint JS sends (remoteTint): the background's top and bottom and the
 * active color. A missing or unreadable tint gives the neutral background and REMOTE_ACTIVE_COLOR, the screen as it
 * stands before JS knows the artwork's color; half a background falls back whole. Twin: RemoteColors in
 * RemoteLayout.swift.
 */
data class RemoteColors(val top: Long, val bottom: Long, val accent: Long) {
    companion object {
        private val HEX = Regex("^#[0-9A-Fa-f]{6}$")

        fun of(top: String?, bottom: String?, accent: String?): RemoteColors {
            val background = argb(top)?.let { t -> argb(bottom)?.let { b -> t to b } }
            return RemoteColors(
                top = background?.first ?: PlayerConstants.REMOTE_TINT_NEUTRAL_TOP,
                bottom = background?.second ?: PlayerConstants.REMOTE_TINT_NEUTRAL_BOTTOM,
                accent = argb(accent) ?: PlayerConstants.REMOTE_ACTIVE_COLOR,
            )
        }

        /** `#RRGGBB` as opaque ARGB; anything else is null. */
        private fun argb(hex: String?): Long? =
            hex?.takeIf { HEX.matches(it) }?.let { 0xFF000000 or it.substring(1).toLong(16) }
    }
}

/** The six slots every layout places (design §3.1). Twin: RemoteSlot in RemoteLayout.swift. */
enum class RemoteSlot { HEADER, ARTWORK, TITLES, BAR, TRANSPORT, BOTTOM_ROW }

/**
 * Where a layout puts the slots: a bar across the top, the slot beside the rest (the artwork, on the left), the
 * column, top to bottom, and a band across the bottom. Couched, the header, the titles and the bottom row's
 * buttons share the top bar and the bar runs along the bottom; wide, the upright column stands beside the artwork.
 * [spaces] are the column's indices where the free height goes, shared equally when the screen is taller than the
 * slots (`column.size`: after the last): upright above and below the artwork, the rest kept together at the
 * bottom as Spotify's player does; couched and wide around the middle, so the transport sits level with the artwork.
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
            RemoteLayout.PORTRAIT -> RemoteArrangement(
                emptyList(), null, upright, emptyList(),
                listOf(upright.indexOf(RemoteSlot.ARTWORK), upright.indexOf(RemoteSlot.TITLES)),
            )
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
    /** The gap between [count] buttons [buttonsDp] wide in all, in a row [widthDp] wide (fittingGap). */
    fun fittingGap(widthDp: Double, buttonsDp: Double, count: Int): Double = fittingGap(widthDp, buttonsDp, count, gapDp)

    companion object {
        /**
         * [gap] when the row has room for it, less when it has not, never under 0: the gap gives way so that no
         * button shrinks. Five buttons upright (340 at the 20 gap) are wider than a 360dp phone's column (312),
         * and the wide column (0.55w - 48) is under the 372 the 28 gap asks for below about 763. Twin:
         * RemoteTransport.fittingGap in RemoteLayout.swift.
         */
        fun fittingGap(width: Double, buttons: Double, count: Int, gap: Double): Double =
            if (count < 2) gap else ((width - buttons) / (count - 1)).coerceIn(0.0, gap)

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

/** What TalkBack says for the remote screen's own controls. */
object RemoteSpeech {
    /** The TV button: the TV's name, or the Cast label when it has none, then the session state, as on iOS. */
    fun targetButton(name: String?, label: String, state: String): String = "${name ?: label}, $state"
}
