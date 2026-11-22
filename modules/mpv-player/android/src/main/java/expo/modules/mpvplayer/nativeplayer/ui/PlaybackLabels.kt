package expo.modules.mpvplayer.nativeplayer.ui

import java.math.BigDecimal

/**
 * A number as the player menus show it, without trailing zeros: 1.5 reads "1.5" and 2.0 reads
 * "2". Java's %g keeps six significant digits ("1.50000"), unlike the C one the iOS chrome
 * formats with. A point in every locale, as the JS player and the iOS chrome write it. A value
 * that is not finite falls back to its plain form instead of throwing.
 */
private fun trimmedDecimal(value: Double): String =
    if (value.isFinite()) BigDecimal.valueOf(value).stripTrailingZeros().toPlainString() else value.toString()

/** A playback rate, for the speed menus and the hold pill: "0.25×", "1×", "1.5×", "2×". */
internal fun speedLabel(rate: Double): String = trimmedDecimal(rate) + "×"

/** A sleep timer preset: "45 min", "1 h", "1.5 h". */
internal fun sleepTimerLabel(minutes: Int): String =
    if (minutes < 60) "$minutes min" else trimmedDecimal(minutes / 60.0) + " h"

/** A sync offset, signed as on iOS: "-5 s", "0 s", "+0.25 s". */
internal fun syncOffsetLabel(seconds: Double): String =
    if (seconds == 0.0) "0 s" else (if (seconds > 0) "+" else "") + trimmedDecimal(seconds) + " s"
