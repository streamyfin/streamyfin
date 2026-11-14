package expo.modules.mpvplayer

import android.graphics.SurfaceTexture
import android.os.Looper
import android.view.Surface
import expo.modules.mpvplayer.nativeplayer.engine.VideoLoadConfig
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * Review of #2441: the next episode, loaded with the screen still off, had its
 * video back on (the file change resets the track selection) and nothing
 * switched it off again until the screen came back.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioOnlyNextFileTest {
    private fun renderer(audioOnly: Boolean = true) =
        MPVLayerRenderer(RuntimeEnvironment.getApplication()).apply {
            setAudioOnlyWhenHidden(audioOnly)
        }

    private fun MPVLayerRenderer.fileLoaded() {
        event(MPVLib.MPV_EVENT_FILE_LOADED)
        shadowOf(Looper.getMainLooper()).idle()
    }

    @Test fun aFileLoadedWhileHiddenSwitchesToAudioOnlyAgain() {
        val renderer = renderer()
        renderer.fileLoaded()
        assertTrue(renderer.isAudioOnlyScheduled())
    }

    @Test fun aFileLoadedOnScreenKeepsItsVideo() {
        val renderer = renderer()
        val texture = SurfaceTexture(0)
        renderer.attachSurface(Surface(texture))
        renderer.fileLoaded()
        assertFalse(renderer.isAudioOnlyScheduled())
        texture.release()
    }

    @Test fun withTheSettingOffAFileLoadedWhileHiddenKeepsItsVideo() {
        val renderer = renderer(audioOnly = false)
        renderer.fileLoaded()
        assertFalse(renderer.isAudioOnlyScheduled())
    }

    // Second review of #2441: the switch queued for the file being replaced
    // was left running when its replacement came with the setting off, and
    // took the replacement's video away a few seconds later.
    @Test fun aReplacementWithTheSettingOffDropsTheSwitchQueuedForTheOldFile() {
        val renderer = renderer()
        renderer.fileLoaded()
        assertTrue(renderer.isAudioOnlyScheduled())

        renderer.load(VideoLoadConfig(url = "file:///next.mkv", audioOnlyWhenHidden = false))
        renderer.fileLoaded()

        assertFalse(renderer.isAudioOnlyScheduled())
    }
}
