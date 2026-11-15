package expo.modules.mpvplayer.nativeplayer.remote

import android.os.Looper.getMainLooper
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.ui.platform.ComposeView
import expo.modules.mpvplayer.cast.engine.ManualScheduler
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.engine.isRemote
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

// The debug probe of the remote screen: it opens over a fake TV of its own, whatever the build's fake
// receivers flag says (the unit tests build without it), and logs what the device proof reads.
@RunWith(RobolectricTestRunner::class)
class RemotePlayerProbeTest {
    private val scheduler = ManualScheduler()
    private val logs = mutableListOf<String>()
    private val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
    private val activity: ComponentActivity get() = screen.get()
    private var session: RemotePlayerSession? = null

    @After
    fun closeLeftovers() {
        session?.teardownImmediately()
        screen.pause().stop().destroy()
        shadowOf(getMainLooper()).idle()
    }

    // Robolectric cannot idle the screen's endless spinner: the probe draws nothing here.
    private fun probe(): RemotePlayerSession? =
        RemotePlayerProbe.run(activity, scheduler.schedule, logs::add) { _, _ -> }
            .also { shadowOf(getMainLooper()).idle() }

    private fun everyView(root: View): List<View> =
        if (root is ViewGroup) listOf(root) + (0 until root.childCount).flatMap { everyView(root.getChildAt(it)) } else listOf(root)

    private fun screens(): Int = everyView(activity.findViewById(android.R.id.content)).count { it is ComposeView }

    // A second at a time, as the device runs it: what a step schedules falls due on the way.
    private fun runFor(ms: Long) = repeat((ms / 1_000).toInt()) { scheduler.advance(1_000) }

    @Test
    fun theProbePresentsTheRemoteScreenOnAFakeEngine() {
        val session = probe().also { session = it }

        assertNotNull(session)
        assertEquals(1, screens())
        assertEquals("Bench episode", session!!.viewModel.metadata?.title)
        assertTrue(session.viewModel.engine!!.isRemote)
        assertTrue(logs.contains("presented: Bench episode on Bench TV"))

        session.dismiss("closeButton")
        shadowOf(getMainLooper()).idle()

        assertEquals(0, screens())
        assertNull(session.viewModel.engine)
        // The screen hands the engine back first; only the lease's owner stops it.
        assertEquals(listOf("dismissed: closeButton", "lease released", "engine stopped"), logs.takeLast(3))
        assertEquals(1, logs.count { it == "engine stopped" })
    }

    @Test
    fun theProbeLogsThePositionAndEveryCommand() {
        val session = probe().also { session = it }!!
        runFor(PlayerConstants.FAKE_REMOTE_LOAD_MS + RemotePlayerProbe.POSITION_LOG_MS)

        assertTrue(logs.any { it.startsWith("position ") && it.endsWith(", playing") })

        val engine = session.viewModel.engine!!
        engine.pause()
        engine.seekBy(30.0)
        runFor(RemotePlayerProbe.POSITION_LOG_MS)

        val pausedAt = logs.single { it.startsWith("pause at ") }.removePrefix("pause at ").toDouble()
        assertEquals("seek by 30.0: ${pausedAt} -> ${pausedAt + 30.0}", logs.single { it.startsWith("seek by ") })
        assertEquals("position ${pausedAt + 30.0}, paused", logs.last { it.startsWith("position ") })
    }

    @Test
    fun aSecondProbeWhileOneIsUpDoesNothing() {
        session = probe()

        assertNull(probe())
        assertEquals(1, screens())
        assertEquals("already presented", logs.last())
    }

    @Test
    fun theProbeAfterAClosedOneOpensAgain() {
        probe()!!.dismiss("closeButton")
        shadowOf(getMainLooper()).idle()

        session = probe()

        assertNotNull(session)
        assertEquals(1, screens())
        assertFalse(logs.contains("already presented"))
    }

    // The proof compares each layout with the mockups, so the probe fills every slot the screen draws from its
    // config: a subtitle line, chapters, two audio tracks, two subtitle tracks with one on (the active color) and
    // an episode list with the current one marked. The artwork comes from the bench's server, not from here.
    @Test
    fun theProbeConfigFillsEverySlot() {
        val config = RemotePlayerProbe.config()

        assertNotNull(config.metadata?.subtitle)
        assertTrue(config.chapters.size >= 2)
        assertTrue((config.tracks?.audio?.size ?: 0) >= 2)
        assertEquals(1, config.tracks?.subtitles?.count { it.selected })
        assertTrue((config.tracks?.subtitles?.size ?: 0) >= 2)
        assertTrue(config.episodeList.size >= 2)
        assertEquals(1, config.episodeList.count { it.isCurrent })
    }
}
