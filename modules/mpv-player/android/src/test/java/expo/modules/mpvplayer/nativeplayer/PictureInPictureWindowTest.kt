package expo.modules.mpvplayer.nativeplayer

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Looper
import android.util.Rational
import androidx.activity.ComponentActivity
import expo.modules.kotlin.Promise
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * The picture in picture window on a phone. The JS player shaped it after the video; the native
 * player always asked for 16:9, so a 4:3 episode or a scope film sat in black bars.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PictureInPictureWindowTest {
    /** Keeps the params the player hands the activity: the shadow does not. */
    class RecordingActivity : ComponentActivity() {
        val params = mutableListOf<PictureInPictureParams>()

        override fun setPictureInPictureParams(params: PictureInPictureParams) {
            this.params += params
            super.setPictureInPictureParams(params)
        }

        /** The system merges each set into the last, a field left unset keeps its value. */
        val aspectRatio: Rational? get() = params.mapNotNull { it.aspectRatio }.lastOrNull()
    }

    private val promise = object : Promise {
        override fun resolve(value: Any?) {}
        override fun reject(code: String?, message: String?, cause: Throwable?) {}
    }

    private val sessions = mutableListOf<NativePlayerSession>()

    // The renderer token is process-wide and released from the main looper: a test that left it
    // held would keep the next test's engine from ever starting.
    @After
    fun releaseTheRenderer() {
        sessions.forEach { it.teardownImmediately() }
        shadowOf(Looper.getMainLooper()).idle()
    }

    private fun present(videoWidth: Int?, videoHeight: Int?): Pair<NativePlayerSession, RecordingActivity> {
        val activity = Robolectric.buildActivity(RecordingActivity::class.java).setup().get()
        shadowOf(activity.packageManager).setSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE, true)
        val session = NativePlayerSession(emit = { _, _ -> }, onTornDown = {}, presenterProvider = { activity })
        sessions += session
        session.present(PlayerPresentConfigRecord().apply {
            // ExoPlayer: mpv's native library does not load on the JVM.
            engine = "exoplayer"
            // Nothing listens on the discard port: the load never gets media, which these tests do not need.
            stream = StreamConfigRecord().apply {
                url = "http://127.0.0.1:9/Videos/item/stream.mkv"
                this.videoWidth = videoWidth
                this.videoHeight = videoHeight
            }
            metadata = MetadataRecord().apply { itemId = "episode" }
        }, promise)
        shadowOf(Looper.getMainLooper()).idle()
        return session to activity
    }

    @Test
    fun theWindowTakesTheShapeOfTheVideo() {
        val (_, activity) = present(videoWidth = 1440, videoHeight = 1080)

        assertEquals(Rational(4, 3), activity.aspectRatio)
    }

    // The media source does not always carry the size; the decoder reports it once it plays.
    @Test
    fun theWindowFollowsASizeOnlyTheDecoderKnows() {
        val (session, activity) = present(videoWidth = null, videoHeight = null)

        session.viewModel.onVideoDimensionsChanged(1440, 1080)

        assertEquals(Rational(4, 3), activity.aspectRatio)
    }
}
