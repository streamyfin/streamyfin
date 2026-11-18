package expo.modules.mpvplayer

import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VideoTrackSuspensionTest {
    /** mpv's properties as a map, with every write kept in order. */
    private class FakeMpv(vararg initial: Pair<String, String>) : TrackProperties {
        val values = mutableMapOf(*initial)
        val writes = mutableListOf<Pair<String, String>>()
        // A write to hold on the worker until the test lets it through.
        @Volatile var holdOn: Pair<String, String>? = null
        val held = CountDownLatch(1)
        val release = CountDownLatch(1)

        override fun get(name: String): String? = synchronized(this) { values[name] }

        override fun set(name: String, value: String) {
            if (holdOn == (name to value)) {
                held.countDown()
                release.await(5, TimeUnit.SECONDS)
            }
            synchronized(this) {
                values[name] = value
                writes += name to value
            }
        }
    }

    private val worker: ExecutorService = Executors.newSingleThreadExecutor()

    @After fun stopWorker() {
        worker.shutdownNow()
    }

    /** Waits for everything queued on the worker so far. */
    private fun drain() {
        worker.submit {}.get(5, TimeUnit.SECONDS)
    }

    private fun suspendedPlayer(): Pair<VideoTrackSuspension, FakeMpv> {
        val mpv = FakeMpv("aid" to "1", "vid" to "1")
        val tracks = VideoTrackSuspension(worker)
        tracks.suspend(mpv)
        drain()
        return tracks to mpv
    }

    // Review of #2441: a restore that passed its check, then a file change
    // before it wrote, put the old file's track ID on the new file and
    // cleared the suspension, so the reset that followed did nothing.
    @Test fun restoreUnderWayWhenTheFileChangesLeavesTheNextFileOnAuto() {
        val (tracks, mpv) = suspendedPlayer()
        mpv.holdOn = "vid" to "1"

        tracks.restore(mpv)
        assertTrue(mpv.held.await(5, TimeUnit.SECONDS))
        tracks.endForNextFile(mpv)
        mpv.release.countDown()
        drain()

        assertEquals("auto", mpv.values["vid"])
        assertEquals("vid" to "auto", mpv.writes.last())
        assertFalse(tracks.isSuspended)
    }

    @Test fun restoreQueuedBeforeAFileChangeIsDropped() {
        val (tracks, mpv) = suspendedPlayer()
        val gate = CountDownLatch(1)
        worker.execute { gate.await(5, TimeUnit.SECONDS) }

        tracks.restore(mpv)
        tracks.endForNextFile(mpv)
        gate.countDown()
        drain()

        assertEquals(listOf("vid" to "no", "vid" to "auto"), mpv.writes)
    }

    @Test fun fileReplacingASuspendedOneStartsWithVideo() {
        val (tracks, mpv) = suspendedPlayer()
        assertTrue(tracks.isSuspended)

        tracks.endForNextFile(mpv)
        drain()

        assertEquals("auto", mpv.values["vid"])
        assertFalse(tracks.isSuspended)
    }

    @Test fun suspendAndRestoreSwitchTheTrackOffAndBack() {
        val (tracks, mpv) = suspendedPlayer()
        assertEquals("no", mpv.values["vid"])

        tracks.restore(mpv)
        drain()

        assertEquals("1", mpv.values["vid"])
        assertFalse(tracks.isSuspended)
    }

    @Test fun nothingIsResetWhenNoSwitchWasMade() {
        val mpv = FakeMpv("aid" to "1", "vid" to "1")
        val tracks = VideoTrackSuspension(worker)

        tracks.endForNextFile(mpv)
        drain()

        assertTrue(mpv.writes.isEmpty())
    }

    @Test fun withoutAnAudioTrackTheVideoStaysOn() {
        val mpv = FakeMpv("aid" to "no", "vid" to "1")
        val tracks = VideoTrackSuspension(worker)

        tracks.suspend(mpv)
        drain()

        assertTrue(mpv.writes.isEmpty())
        assertFalse(tracks.isSuspended)
    }

    @Test fun stoppingClearsTheSuspensionWithoutAPlayer() {
        val (tracks, mpv) = suspendedPlayer()

        tracks.endForNextFile(null)
        drain()

        assertFalse(tracks.isSuspended)
        assertEquals(listOf("vid" to "no"), mpv.writes)
    }
}
