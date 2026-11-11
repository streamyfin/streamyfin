package expo.modules.mpvplayer

import android.app.Activity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
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

    // The view props arrive in JSX order, the source before backgroundPlayback: a player screen
    // could start before it was allowed, and stayed disarmed until the next pause and play.
    @Test
    fun turningItOnWhilePlayingArmsIt() {
        val pip = controller()
        pip.autoEnterAllowed = false
        pip.setPlaybackRate(1.0)
        pip.autoEnterAllowed = true
        assertTrue(pip.isAutoEnterArmed)
    }

    @Test
    fun turningItOnBeforeAnyPlaybackLeavesItDisarmed() {
        val pip = controller()
        pip.autoEnterAllowed = false
        pip.autoEnterAllowed = true
        assertFalse(pip.isAutoEnterArmed)
    }

    // The preview opens with every visit to the settings page: a receiver left registered keeps
    // the controller and its view alive.
    @Test
    fun aViewWithoutAutoEnterLeavesNoReceiverBehind() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val pip = PiPController(activity)
        pip.autoEnterAllowed = false
        pip.setPlaybackRate(1.0)
        assertEquals("none while it plays", 0, pipReceivers())
        pip.stopPictureInPicture()
        assertEquals(0, pipReceivers())
    }

    // Paused before it ever played, a player registered the receiver with its params but no
    // lifecycle callbacks, and the cleanup only unregistered it along with those.
    @Test
    fun aPausedPlayerLeavesNoReceiverBehind() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val pip = PiPController(activity)
        pip.setPlaybackRate(0.0)
        pip.stopPictureInPicture()
        assertEquals(0, pipReceivers())
    }

    @Test
    fun aPlayerScreenLeavesNoReceiverBehindEither() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val pip = PiPController(activity)
        pip.setPlaybackRate(1.0)
        pip.stopPictureInPicture()
        assertEquals(0, pipReceivers())
    }

    private fun pipReceivers() = shadowOf(RuntimeEnvironment.getApplication()).registeredReceivers
        .count { it.broadcastReceiver.javaClass.name.startsWith(PiPController::class.java.name) }
}
