package expo.modules.mpvplayer.cast

/**
 * CSS colours as React Native hands them over (`#RGB`, `#RRGGBB`, `#RRGGBBAA`, `transparent`),
 * to the ARGB int Android drawables take. Color.parseColor rejects the short form and reads
 * eight digits as AARRGGBB, so the parsing is done here, the way the iOS button does it.
 */
object CastColors {
    fun parseCssColor(value: String): Int? {
        val trimmed = value.trim()
        if (trimmed.equals("transparent", ignoreCase = true)) return 0
        if (!trimmed.startsWith("#")) return null
        var hex = trimmed.substring(1)
        if (hex.length == 3) hex = hex.map { "$it$it" }.joinToString("")
        if (hex.length != 6 && hex.length != 8) return null
        val digits = hex.toLongOrNull(16) ?: return null
        return if (hex.length == 8) {
            val rgb = (digits shr 8) and 0xFFFFFF
            val alpha = digits and 0xFF
            ((alpha shl 24) or rgb).toInt()
        } else {
            (0xFF000000L or digits).toInt()
        }
    }
}
