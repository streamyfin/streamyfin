package expo.modules.mpvplayer

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * The subtitle preview plays a clip in an embedded player. Playing it armed the automatic picture in
 * picture, and Home from Settings shrank the whole app into a PiP window.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PiPAutoEnterTest {
    private fun controller() = PiPController(RuntimeEnvironment.getApplication())

    @Test
    fun playingArmsAutoEnter() {
        val pip = controller()
        pip.setPlaybackRate(1.0)
        assertTrue(pip.isAutoEnterArmed)
    }

    @Test
    fun aViewWithoutAutoEnterNeverArmsIt() {
        val pip = controller()
        pip.autoEnterAllowed = false
        pip.setPlaybackRate(1.0)
        assertFalse(pip.isAutoEnterArmed)
    }

    @Test
    fun turningItOffDisarmsAPlayingView() {
        val pip = controller()
        pip.setPlaybackRate(1.0)
        pip.autoEnterAllowed = false
        assertFalse(pip.isAutoEnterArmed)
    }

    // Arming waits for the next play: a player screen must not enter PiP on Home before its
    // video starts.
    @Test
    fun turningItOnWaitsForPlayback() {
        val pip = controller()
        pip.autoEnterAllowed = false
        pip.setPlaybackRate(0.0)
        pip.autoEnterAllowed = true
        assertFalse(pip.isAutoEnterArmed)
        pip.setPlaybackRate(1.0)
        assertTrue(pip.isAutoEnterArmed)
    }
}
