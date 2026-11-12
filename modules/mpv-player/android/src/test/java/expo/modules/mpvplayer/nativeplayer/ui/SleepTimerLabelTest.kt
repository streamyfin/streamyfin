package expo.modules.mpvplayer.nativeplayer.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/** The sleep timer's choices. 90 minutes read "1 h", the same as 60. */
class SleepTimerLabelTest {
    @Test
    fun aChoiceUnderAnHourReadsInMinutes() {
        assertEquals("45 min", sleepTimerLabel(45))
    }

    @Test
    fun aChoiceOfWholeHoursReadsInHours() {
        assertEquals("1 h", sleepTimerLabel(60))
        assertEquals("2 h", sleepTimerLabel(120))
    }

    @Test
    fun aChoiceBetweenHoursKeepsItsMinutes() {
        assertEquals("1 h 30 min", sleepTimerLabel(90))
    }
}
