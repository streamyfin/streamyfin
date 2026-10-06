package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.*
import org.junit.Test

class PendingSeekReportTest {
    @Test fun previousProgressCannotAcknowledgeFractionalPausedSeek() {
        val report = PendingSeekReport()
        report.request(28.8)
        assertFalse(report.consume(28.0))
        assertFalse(report.consume(119.0))
        assertTrue(report.consume(28.8))
        assertFalse(report.consume(28.8))
    }

    @Test fun supersededSeekWaitsForTheNewLandingPosition() {
        val report = PendingSeekReport()
        report.request(10.0)
        report.request(56.708)
        assertFalse(report.consume(10.0))
        assertTrue(report.consume(56.708))
    }

    @Test fun decoderReloadDiscardsOldSeekAcknowledgement() {
        val report = PendingSeekReport()
        report.request(28.8)
        report.reset()
        assertFalse(report.consume(28.8))
    }
}
