package expo.modules.mpvplayer.nativeplayer.remote

import android.content.pm.ActivityInfo
import android.os.Looper.getMainLooper
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.compose.ui.platform.ComposeView
import expo.modules.mpvplayer.nativeplayer.MetadataRecord
import expo.modules.mpvplayer.nativeplayer.NativePlayerSession
import expo.modules.mpvplayer.nativeplayer.RemotePlayerConfigRecord
import expo.modules.mpvplayer.nativeplayer.jsTransportTarget
import expo.modules.mpvplayer.nativeplayer.engine.RemoteOnlyEngine
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

// The remote screen is the chrome over a remote engine and nothing else: no surface, no change to the window
// (the bars stay, the phone sleeps, it turns with the phone), and closing it hands the engine back without
// stopping the TV. Every event it sends says it is remote.
@RunWith(RobolectricTestRunner::class)
class RemotePlayerSessionTest {
    private class StopCountingEngine : RemoteOnlyEngine() {
        var stops = 0
        override fun stop() {
            stops += 1
        }
    }

    private val engine = StopCountingEngine()
    private var released = 0
    private var tornDown = 0
    private val events = mutableListOf<Pair<String, Map<String, Any?>>>()
    private val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
    private val activity: ComponentActivity get() = screen.get()
    private var session: RemotePlayerSession? = null

    // Every test closes what it opened: a screen left up would outlive its test on the main looper.
    @After
    fun closeLeftovers() {
        session?.teardownImmediately()
        screen.pause().stop().destroy()
        shadowOf(getMainLooper()).idle()
    }

    private fun presented(): RemotePlayerSession {
        val session = RemotePlayerSession(
            lease = RemoteEngineLease(engine) { released += 1 },
            emit = { name, body -> events += name to body },
            onTornDown = { tornDown += 1 },
            screenContent = { _, _ -> },
        )
        session.present(activity, RemotePlayerConfigRecord().also {
            it.metadata = MetadataRecord().also { metadata -> metadata.title = "Bench episode" }
            it.targetName = "Bench TV"
        })
        shadowOf(getMainLooper()).idle()
        this.session = session
        return session
    }

    private fun content(): ViewGroup = activity.findViewById(android.R.id.content)

    private fun everyView(root: View): List<View> =
        if (root is ViewGroup) listOf(root) + (0 until root.childCount).flatMap { everyView(root.getChildAt(it)) } else listOf(root)

    private fun hasScreen(): Boolean = everyView(content()).any { it is ComposeView }

    @Test
    fun aRemoteSessionShowsNoSurface() {
        presented()

        assertTrue(hasScreen())
        assertFalse(everyView(activity.window.decorView).any { it is SurfaceView })
    }

    @Test
    fun aRemoteSessionLeavesTheWindowAlone() {
        val orientation = activity.requestedOrientation
        @Suppress("DEPRECATION")
        val uiVisibility = activity.window.decorView.systemUiVisibility

        presented()

        assertEquals(0, activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        assertEquals(orientation, activity.requestedOrientation)
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED, activity.requestedOrientation)
        @Suppress("DEPRECATION")
        assertEquals(uiVisibility, activity.window.decorView.systemUiVisibility)
        assertEquals(0, activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_FULLSCREEN)
    }

    @Test
    fun closingARemoteSessionReleasesItsLeaseAndNeverStopsTheEngine() {
        val session = presented()

        session.dismiss("closeButton")
        shadowOf(getMainLooper()).idle()

        assertEquals(1, released)
        assertEquals(0, engine.stops)
        assertNull(engine.delegate)
        assertFalse(hasScreen())
        assertEquals(1, tornDown)
        assertEquals("closeButton", events.single { it.first == "onDismiss" }.second["reason"])
    }

    @Test
    fun backClosesTheRemoteSession() {
        presented()

        activity.onBackPressedDispatcher.onBackPressed()
        shadowOf(getMainLooper()).idle()

        assertEquals(1, released)
        assertFalse(hasScreen())
        assertEquals("closeButton", events.single { it.first == "onDismiss" }.second["reason"])
    }

    @Test
    fun aReloadOfTheAppDetachesWithoutStopping() {
        val session = presented()

        session.teardownImmediately()
        shadowOf(getMainLooper()).idle()

        assertEquals(1, released)
        assertEquals(0, engine.stops)
        assertNull(engine.delegate)
        assertFalse(hasScreen())
        assertEquals(1, tornDown)
    }

    // The system recreates the activity on a font or display size change: the screen added over the old one
    // would be shown nowhere, so it closes with it (learned fact native-view-dies-with-a-recreated-activity).
    @Test
    fun aRecreatedActivityClosesTheRemoteSession() {
        presented()

        screen.recreate()
        shadowOf(getMainLooper()).idle()

        assertEquals(1, released)
        assertEquals(0, engine.stops)
        assertEquals(1, tornDown)
    }

    @Test
    fun everyEventOfARemoteSessionIsMarked() {
        val session = presented()
        engine.delegate?.onPauseChanged(false)
        engine.delegate?.onPositionChanged(3.0, 120.0, 0.0)

        session.dismiss("closeButton")
        shadowOf(getMainLooper()).idle()

        assertTrue(events.map { it.first }.containsAll(listOf("onPlaybackStateChange", "onProgress", "onDismiss")))
        assertTrue("unmarked: $events", events.all { it.second["remote"] == true })
    }

    @Test
    fun jsTransportOnlyReachesALocalPlayer() {
        val remote = presented()
        val local = NativePlayerSession(emit = { _, _ -> }, onTornDown = {}, presenterProvider = { null })

        assertNull(jsTransportTarget(remote))
        assertSame(local.viewModel, jsTransportTarget(local))
        assertNull(jsTransportTarget(null))
    }
}
