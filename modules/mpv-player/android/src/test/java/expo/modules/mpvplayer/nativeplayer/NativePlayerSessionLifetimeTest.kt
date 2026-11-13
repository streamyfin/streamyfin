package expo.modules.mpvplayer.nativeplayer

import android.os.Looper
import androidx.activity.ComponentActivity
import expo.modules.kotlin.Promise
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** What a native player leaves behind once it ends. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NativePlayerSessionLifetimeTest {
    private val events = mutableListOf<String>()
    private var tornDown = 0
    private val rejections = mutableListOf<String?>()

    private val promise = object : Promise {
        override fun resolve(value: Any?) {}
        override fun reject(code: String?, message: String?, cause: Throwable?) {
            rejections += code
        }
    }

    private val sessions = mutableListOf<NativePlayerSession>()

    private fun session(activity: ComponentActivity?) = NativePlayerSession(
        emit = { name, _ -> events += name },
        onTornDown = { tornDown++ },
        presenterProvider = { activity },
    ).also { sessions += it }

    // The renderer token is process-wide and released from the main looper: a test that left it
    // held would keep the next test's engine from ever starting.
    @After
    fun releaseTheRenderer() {
        sessions.forEach { it.teardownImmediately() }
        shadowOf(Looper.getMainLooper()).idle()
    }

    // ExoPlayer: mpv's native library does not load on the JVM.
    private fun config() = PlayerPresentConfigRecord().apply {
        engine = "exoplayer"
        // Nothing listens on the discard port: the load never gets media, which these tests do not need.
        stream = StreamConfigRecord().apply { url = "http://127.0.0.1:9/Videos/item/stream.mkv" }
        metadata = MetadataRecord().apply { itemId = "film" }
    }

    private fun presented(): Pair<NativePlayerSession, org.robolectric.android.controller.ActivityController<ComponentActivity>> {
        val controller = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        val session = session(controller.get())
        session.present(config(), promise)
        shadowOf(Looper.getMainLooper()).idle()
        return session to controller
    }

    // The module refuses a new player while it holds a session (PlayerAlreadyPresentedException).
    // A session that outlived its player was never dropped, so every play after it was refused
    // until the process died: 112 events from 14 Android users on 0.55.1 and 0.55.2.

    // A play from another client lands while the app has no activity in front.
    @Test
    fun aPlayerWithNoActivityToOpenInLeavesNoSession() {
        session(activity = null).present(config(), promise)

        assertEquals(listOf("NO_PRESENTER"), rejections)
        assertEquals(1, tornDown)
    }

    // The system destroys the activity the player sits in; the process, the JS session and the
    // module live on.
    @Test
    fun aPlayerWhoseActivityIsDestroyedEndsItsSession() {
        val (_, controller) = presented()
        assertEquals(emptyList<String?>(), rejections)
        assertEquals(0, tornDown)

        controller.pause().stop().destroy()
        shadowOf(Looper.getMainLooper()).idle()

        assertEquals(1, tornDown)
        // JS ends its own session on onDismiss, and reports the stop to the server.
        assertEquals(1, events.count { it == "onDismiss" })
    }

    // presentPlayer runs off the main thread, and present posts the player's setup to it. An
    // activity destroyed in between ends the session first (onActivityDestroyed): the setup then
    // built an engine nothing would ever release, and left the play request unanswered.
    @Test
    fun aPlayerEndedBeforeItsSetupRanIsNotBuilt() {
        val controller = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        val session = session(controller.get())
        Thread { session.present(config(), promise) }.apply { start(); join() }

        session.dismiss("closeButton")
        shadowOf(Looper.getMainLooper()).idle()

        assertNull(session.engine)
        assertEquals(listOf("PRESENT_CANCELLED"), rejections)
        assertEquals(1, tornDown)
    }

    // The film ends, the sleep timer runs out or the group stops while the player is in its
    // picture in picture window: the app stayed in that window with nothing playing in it.
    @Test
    fun aPlayerClosedInPictureInPictureTakesTheAppOutOfTheWindow() {
        val (session, controller) = presented()
        controller.get().enterPictureInPictureMode()
        assertTrue(controller.get().isInPictureInPictureMode)

        session.dismiss("playbackEnded")

        assertTrue(shadowOf(controller.get()).isTaskMovedToBack)
    }

    @Test
    fun aPlayerTornDownInPictureInPictureTakesTheAppOutOfTheWindow() {
        val (session, controller) = presented()
        controller.get().enterPictureInPictureMode()
        assertTrue(controller.get().isInPictureInPictureMode)

        session.teardownImmediately()

        assertTrue(shadowOf(controller.get()).isTaskMovedToBack)
    }

    @Test
    fun aPlayerClosedFullScreenLeavesTheAppInFront() {
        val (session, controller) = presented()

        session.dismiss("closeButton")

        assertFalse(shadowOf(controller.get()).isTaskMovedToBack)
    }
}
