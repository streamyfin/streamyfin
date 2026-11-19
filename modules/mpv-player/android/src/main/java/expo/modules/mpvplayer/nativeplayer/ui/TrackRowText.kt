package expo.modules.mpvplayer.nativeplayer.ui

/** What a track row says: its label, and the format and flags JS put under it. */
internal object TrackRowText {
    /** The second line, or none when JS has nothing to add to the label. */
    fun detailLine(detail: String?): String? = detail?.takeIf { it.isNotBlank() }

    /** One line, for menus that draw a single line per row (the TV's). */
    fun oneLine(label: String, detail: String?): String =
        detailLine(detail)?.let { "$label · $it" } ?: label
}
