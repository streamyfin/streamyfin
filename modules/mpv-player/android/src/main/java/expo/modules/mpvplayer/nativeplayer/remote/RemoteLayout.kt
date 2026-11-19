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

/** A box's size, in dp. Twin: RemoteBox in RemoteLayout.swift. */
data class RemoteBox(val widthDp: Double, val heightDp: Double)

/**
 * What ends the couched top bar on the right: "more" when it has a menu, else the last track button, else the TV.
 * Its ink, not its box, meets the margin (RemoteMetrics.topBarInkInsets). Twin: RemoteTopBarEnd in RemoteLayout.swift.
 */
enum class RemoteTopBarEnd {
    MORE, TRACK_BUTTON, TARGET;

    companion object {
        fun of(showsMore: Boolean, trackButtons: Int): RemoteTopBarEnd = when {
            showsMore -> MORE
            trackButtons > 0 -> TRACK_BUTTON
            else -> TARGET
        }
    }
}

/**
 * How big the artwork is. Upright and wide, a square: what the rest of the screen leaves once its text is counted
 * at the font scale asked for, between REMOTE_ARTWORK_MIN_DP and REMOTE_ARTWORK_MAX_DP; the artwork gives up its
 * height first, and when nothing fits even at its minimum, the column scrolls. Couched, the image in its own shape,
 * as large as the left half and the band under the top bar leave it: the text stands beside it, and scrolls there.
 */
object RemoteMetrics {
    /** The height the rest of the screen takes above and below the artwork. */
    fun chromeHeight(layout: RemoteLayout, fontScale: Double): Double = when (layout) {
        RemoteLayout.PORTRAIT ->
            PlayerConstants.REMOTE_PORTRAIT_FIXED_DP + PlayerConstants.REMOTE_PORTRAIT_TEXT_DP * fontScale
        // The top bar, and the image's inset above and below in the band under it.
        RemoteLayout.LANDSCAPE ->
            PlayerConstants.REMOTE_BUTTON_SMALL_DP + 2 * PlayerConstants.REMOTE_LANDSCAPE_ARTWORK_INSET_DP
        // Beside the column, the artwork only keeps a margin above and below.
        RemoteLayout.WIDE -> 2 * PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP
    }

    /**
     * The width of the box beside the column. Wide, the artwork's share of the whole width, the one its size is
     * reckoned against; couched, one of the two equal halves the side margins and the gutter leave; upright
     * nothing stands beside the column: null.
     */
    fun besideWidth(layout: RemoteLayout, widthDp: Double): Double? = when (layout) {
        RemoteLayout.WIDE -> widthDp * PlayerConstants.REMOTE_WIDE_ARTWORK_FRACTION
        RemoteLayout.LANDSCAPE ->
            ((widthDp - 2 * PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP - PlayerConstants.REMOTE_LANDSCAPE_GUTTER_DP) / 2)
                .coerceAtLeast(0.0)
        RemoteLayout.PORTRAIT -> null
    }

    /**
     * The artwork's box. [aspectRatio] is the image's width over its height, as JS sends it (artworkAspectRatio);
     * couched, an unknown or impossible one gives the square the artwork had before the screen knew shapes.
     */
    fun artworkBox(layout: RemoteLayout, widthDp: Double, heightDp: Double, fontScale: Double, aspectRatio: Double?): RemoteBox {
        if (layout != RemoteLayout.LANDSCAPE) return artworkHeight(layout, widthDp, heightDp, fontScale).let { RemoteBox(it, it) }
        val ratio = aspectRatio?.takeIf { it.isFinite() && it > 0 } ?: 1.0
        val maxWidth = besideWidth(layout, widthDp) ?: 0.0
        val maxHeight = (heightDp - chromeHeight(layout, fontScale)).coerceAtLeast(0.0)
        // Wider than the room's shape, the width binds; otherwise the height does.
        return if (maxHeight * ratio > maxWidth) RemoteBox(maxWidth, maxWidth / ratio) else RemoteBox(maxHeight * ratio, maxHeight)
    }

    /** The square artwork's side, upright and wide; couched, the height of the box [artworkBox] gives a square. */
    fun artworkHeight(layout: RemoteLayout, widthDp: Double, heightDp: Double, fontScale: Double): Double {
        val byWidth = when (layout) {
            RemoteLayout.PORTRAIT -> widthDp - 2 * PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP
            RemoteLayout.LANDSCAPE -> return artworkBox(layout, widthDp, heightDp, fontScale, null).heightDp
            // Centered in its share, with the side margin on each side: the whole share put it against the titles.
            RemoteLayout.WIDE ->
                widthDp * PlayerConstants.REMOTE_WIDE_ARTWORK_FRACTION - 2 * PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP
        }
        val byHeight = heightDp - chromeHeight(layout, fontScale)
        return minOf(byWidth, byHeight)
            .coerceIn(PlayerConstants.REMOTE_ARTWORK_MIN_DP, PlayerConstants.REMOTE_ARTWORK_MAX_DP)
    }

    /**
     * How far the couched top bar reaches past the side margins, start and end, so the ink of its first and last
     * buttons meets them rather than their boxes' air.
     */
    fun topBarInkInsets(end: RemoteTopBarEnd): Pair<Double, Double> =
        PlayerConstants.REMOTE_CHEVRON_INK_INSET_DP to when (end) {
            RemoteTopBarEnd.MORE -> PlayerConstants.REMOTE_MORE_INK_INSET_DP
            RemoteTopBarEnd.TRACK_BUTTON -> PlayerConstants.REMOTE_TRACK_BUTTON_INK_INSET_DP
            RemoteTopBarEnd.TARGET -> 0.0
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
 * column, top to bottom, and a band across the bottom. Couched, the header and the bottom row's buttons share the
 * top bar, and the titles, the bar and the transport stand beside the image; wide, the upright column stands
 * beside the artwork. [spaces] are the column's indices where the free height goes, shared equally when the column
 * is taller than its slots (`column.size`: after the last): upright above and below the artwork, the rest kept
 * together at the bottom as Spotify's player does; couched before the bar and the transport, so the column as tall
 * as the image has the titles level with its top and the transport with its bottom; wide around the middle.
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
                topBar = listOf(RemoteSlot.HEADER, RemoteSlot.BOTTOM_ROW),
                beside = RemoteSlot.ARTWORK,
                column = listOf(RemoteSlot.TITLES, RemoteSlot.BAR, RemoteSlot.TRANSPORT),
                bottom = emptyList(),
                spaces = listOf(1, 2),
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

/**
 * The remote "more" menu: what ChromeCapabilities leaves of the local one, quality and chapters. With neither, its
 * button is not drawn, as it would open an empty menu. Twin: RemoteMore in RemoteLayout.swift.
 */
object RemoteMore {
    fun shows(chapters: Int, qualities: Int): Boolean = chapters > 0 || qualities > 0
}

/** What TalkBack says for the remote screen's own controls. */
object RemoteSpeech {
    /** The TV button: the TV's name, or the Cast label when it has none, then the session state, as on iOS. */
    fun targetButton(name: String?, label: String, state: String): String = "${name ?: label}, $state"
}
