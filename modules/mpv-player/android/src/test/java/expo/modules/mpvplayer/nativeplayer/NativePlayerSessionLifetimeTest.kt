package expo.modules.mpvplayer.nativeplayer

import android.os.Looper
import androidx.activity.ComponentActivity
import expo.modules.kotlin.Promise
import org.junit.Assert.assertEquals
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

    private fun session(activity: ComponentActivity?) = NativePlayerSession(
        emit = { name, _ -> events += name },
        onTornDown = { tornDown++ },
        presenterProvider = { activity },
    )

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
}
