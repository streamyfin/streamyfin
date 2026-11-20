package expo.modules.mpvplayer.cast

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The JS side hands CSS colours over ("#666", "#9334E9", "transparent"); Android's
// Color.parseColor rejects the short form and reads eight digits as AARRGGBB, so the
// button parses them itself, the way the iOS button does.
class CastColorsTest {
    @Test
    fun shortAndLongHexFormsGiveOpaqueColours() {
        assertEquals(0xFF666666.toInt(), CastColors.parseCssColor("#666"))
        assertEquals(0xFF9334E9.toInt(), CastColors.parseCssColor("#9334E9"))
        assertEquals(0xFF9334E9.toInt(), CastColors.parseCssColor(" #9334e9 "))
    }

    @Test
    fun eightDigitsCarryTheAlphaLast() {
        assertEquals(0x809334E9.toInt(), CastColors.parseCssColor("#9334E980"))
    }

    @Test
    fun transparentIsTransparent() {
        assertEquals(0, CastColors.parseCssColor("transparent"))
        assertEquals(0, CastColors.parseCssColor("TRANSPARENT"))
    }

    @Test
    fun anythingElseIsIgnored() {
        assertNull(CastColors.parseCssColor("red"))
        assertNull(CastColors.parseCssColor("#12345"))
        assertNull(CastColors.parseCssColor("#GGGGGG"))
        assertNull(CastColors.parseCssColor(""))
    }
}
