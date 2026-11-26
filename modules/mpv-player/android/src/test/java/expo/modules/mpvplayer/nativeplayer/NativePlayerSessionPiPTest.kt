package expo.modules.mpvplayer.nativeplayer

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import expo.modules.mpvplayer.nativeplayer.engine.ChromeEngine
import expo.modules.mpvplayer.nativeplayer.engine.RecordingLocalEngine
import expo.modules.mpvplayer.nativeplayer.engine.RemoteOnlyEngine
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

// The picture in picture paths read the device alone, past the capabilities: with a remote engine,
// leaving the app floated a window with nothing to show.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NativePlayerSessionPiPTest {
    class PiPRecordingActivity : Activity() {
        var entered = 0
        var paramsSet = 0
        override fun enterPictureInPictureMode(params: PictureInPictureParams): Boolean {
            entered++
            return true
        }
        override fun setPictureInPictureParams(params: PictureInPictureParams) {
            paramsSet++
        }
    }

    private lateinit var activity: PiPRecordingActivity

    // As present() does: the engine first, then the capabilities from the device.
    private fun session(engine: ChromeEngine): NativePlayerSession {
        shadowOf(RuntimeEnvironment.getApplication().packageManager)
            .setSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE, true)
        activity = Robolectric.buildActivity(PiPRecordingActivity::class.java).setup().get()
        val session = NativePlayerSession(emit = { _, _ -> }, onTornDown = {}, presenterProvider = { activity })
        NativePlayerSession::class.java.getDeclaredField("hostActivity")
            .apply { isAccessible = true }.set(session, activity)
        session.viewModel.engine = engine
        session.viewModel.applyCapabilities(pictureInPictureSupported = session.isPiPSupported())
        return session
    }

    private fun NativePlayerSession.setupPiP(allowPip: Boolean) {
        NativePlayerSession::class.java
            .getDeclaredMethod("setupPiP", Activity::class.java, Boolean::class.javaPrimitiveType)
            .apply { isAccessible = true }.invoke(this, activity, allowPip)
    }

    private fun NativePlayerSession.updatePiPParams(isPlaying: Boolean) {
        NativePlayerSession::class.java
            .getDeclaredMethod("updatePiPParams", Boolean::class.javaPrimitiveType)
            .apply { isAccessible = true }.invoke(this, isPlaying)
    }

    private fun pipReceivers() = shadowOf(RuntimeEnvironment.getApplication()).registeredReceivers
        .count { it.broadcastReceiver.javaClass.name.startsWith(NativePlayerSession::class.java.name) }

    @Test
    fun aLocalEngineStillFloatsAPicture() {
        val session = session(RecordingLocalEngine())
        session.setupPiP(allowPip = true)
        session.updatePiPParams(isPlaying = true)
        session.enterPiP()
        assertEquals("auto enter armed, then its buttons", 2, activity.paramsSet)
        assertEquals(1, pipReceivers())
        assertEquals(1, activity.entered)
    }

    @Test
    fun aRemoteEngineArmsNoAutoEnter() {
        val session = session(RemoteOnlyEngine())
        session.setupPiP(allowPip = true)
        session.updatePiPParams(isPlaying = true)
        assertEquals(0, activity.paramsSet)
        assertEquals(0, pipReceivers())
    }

    @Test
    fun aRemoteEngineEntersNoPictureInPicture() {
        val session = session(RemoteOnlyEngine())
        session.enterPiP()
        assertEquals(0, activity.entered)
    }
}
