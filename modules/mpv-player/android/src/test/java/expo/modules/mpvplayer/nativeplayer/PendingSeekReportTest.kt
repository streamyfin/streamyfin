package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.*
import org.junit.Test

class PendingSeekReportTest {
    @Test fun finalCompletionPersistsAfterTheOldNearbyPauseTick() {
        val report = PendingSeekReport()
        val previousRequest = report.request(4.333)
        val currentRequest = report.request(4.446)
        var trackedPosition = 4.333
        var persistedPosition = trackedPosition
        // A nearby pause snapshot is still ordinary progress. It has no
        // current decoder completion token and cannot consume this request.
        assertFalse(report.acceptCompletion(previousRequest, trackedPosition))
        trackedPosition = 4.445
        if (report.acceptCompletion(currentRequest, trackedPosition)) persistedPosition = trackedPosition
        assertEquals(4.445, persistedPosition, 0.000001)
    }

    @Test fun supersededSeekWaitsForTheNewLandingPosition() {
        val report = PendingSeekReport()
        val old = report.request(10.0)
        val current = report.request(10.2)
        assertFalse(report.acceptCompletion(old, 10.19))
        assertTrue(report.acceptCompletion(current, 10.208333))
    }

    @Test fun decoderReloadDiscardsOldSeekAcknowledgement() {
        val report = PendingSeekReport()
        val old = report.request(28.8)
        report.reset()
        val current = report.request(28.8)
        assertFalse(report.acceptCompletion(old, 28.8))
        assertTrue(report.acceptCompletion(current, 28.8))
    }

    @Test fun coalescedRestartsAlwaysPersistTheLatestPhysicalCompletion() {
        val report = PendingSeekReport()
        val current = report.request(4.446)
        assertTrue(report.acceptCompletion(current, 4.333))
        assertTrue(report.acceptCompletion(current, 4.445))
    }

    @Test fun soloKeyframeLandingUsesTheDecoderClockRatherThanTheRequestedTarget() {
        val report = PendingSeekReport()
        val current = report.request(10.8)
        assertTrue(report.acceptCompletion(current, 5.0))
        assertFalse(report.acceptCompletion(current, Double.NaN))
    }
}
