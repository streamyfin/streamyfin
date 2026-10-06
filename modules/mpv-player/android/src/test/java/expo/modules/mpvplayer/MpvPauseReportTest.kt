package expo.modules.mpvplayer

import org.junit.Assert.*
import org.junit.Test

class MpvPauseReportTest {
    @Test fun pausePersistsPhysicalPositionBeforePlaybackState() {
        var lastReportedPosition = 44.833
        var persistedPausePosition: Double? = null
        val events = mutableListOf<String>()
        MpvPauseReport(true, 45.88, 120.0, 6.0).deliver(
            onProgress = { position, _, _ ->
                lastReportedPosition = position
                events += "progress"
            },
            onPause = { paused ->
                assertTrue(paused)
                persistedPausePosition = lastReportedPosition
                events += "pause"
            },
        )
        assertEquals(45.88, persistedPausePosition!!, 0.000001)
        assertEquals(listOf("progress", "pause"), events)
    }

    @Test fun queuedPauseRetainsItsPhysicalSnapshotAcrossLaterSeeks() {
        var enginePosition = 56.708
        val queuedReport = MpvPauseReport(true, enginePosition, 120.0, 3.0)
        enginePosition = 120.0
        var reportedPosition = -1.0
        queuedReport.deliver(
            onProgress = { position, _, _ -> reportedPosition = position },
            onPause = {},
        )
        assertEquals(120.0, enginePosition, 0.0)
        assertEquals(56.708, reportedPosition, 0.000001)
    }

    @Test fun progressReentryCannotTurnAPausedReportIntoPlaying() {
        var enginePaused = true
        var lastReportedPosition = 20.0
        val persisted = mutableListOf<Pair<Double, Boolean>>()
        val pausedSnapshot = MpvPauseReport(enginePaused, 20.8, 120.0, 3.0)
        pausedSnapshot.deliver(
            onProgress = { position, _, _ ->
                lastReportedPosition = position
                // A progress consumer can initiate a newer playback action.
                enginePaused = false
            },
            onPause = { paused -> persisted += lastReportedPosition to paused },
        )
        assertFalse(enginePaused)
        assertEquals(listOf(20.8 to true), persisted)
    }

    @Test fun missingPhysicalClockDoesNotReportAnOptimisticSeekTarget() {
        for (position in listOf(null, Double.NaN, Double.POSITIVE_INFINITY, -1.0)) {
            var progressReported = false
            var pauseReported = false
            MpvPauseReport(true, position, 120.0, 0.0).deliver(
                onProgress = { _, _, _ -> progressReported = true },
                onPause = { pauseReported = it },
            )
            assertFalse(progressReported)
            assertTrue(pauseReported)
        }
    }

    @Test fun resumeKeepsPlayingProgressThrottle() {
        var progressReported = false
        var reportedPaused: Boolean? = null
        MpvPauseReport(false, 56.708, 120.0, 0.0).deliver(
            onProgress = { _, _, _ -> progressReported = true },
            onPause = { reportedPaused = it },
        )
        assertFalse(progressReported)
        assertEquals(false, reportedPaused)
    }
}
