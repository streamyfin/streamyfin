package expo.modules.mpvplayer.nativeplayer.ui

import java.math.BigDecimal

/**
 * A playback rate as the speed menus and the hold pill show it, without trailing zeros: 1.5
 * reads "1.5×" and 2.0 reads "2×". Java's %g keeps six significant digits ("1.50000×"), unlike
 * the C one the iOS chrome formats with.
 */
internal fun speedLabel(rate: Double): String =
    BigDecimal.valueOf(rate).stripTrailingZeros().toPlainString() + "×"
