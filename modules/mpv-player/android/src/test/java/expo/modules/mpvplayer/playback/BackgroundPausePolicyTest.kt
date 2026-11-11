package expo.modules.mpvplayer.playback

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BackgroundPausePolicyTest {
    private fun stop(
        isTelevision: Boolean = false,
        screenInteractive: Boolean = true,
        inPictureInPicture: Boolean = false,
        changingConfigurations: Boolean = false,
        dismissing: Boolean = false,
    ) = shouldPauseOnActivityStop(
        isTelevision, screenInteractive, inPictureInPicture, changingConfigurations, dismissing
    )

    @Test
    fun leavingTheAppWithTheScreenOnPauses() = assertTrue(stop())

    // What the media playback service is for.
    @Test
    fun theScreenTurningOffPlaysOn() = assertFalse(stop(screenInteractive = false))

    @Test
    fun pictureInPicturePlaysOn() = assertFalse(stop(inPictureInPicture = true))

    @Test
    fun aRotationPlaysOn() = assertFalse(stop(changingConfigurations = true))

    @Test
    fun closingThePlayerIsNotLeavingIt() = assertFalse(stop(dismissing = true))

    // Home on the remote, or standby with HDMI audio still on: the film played behind the
    // launcher.
    @Test
    fun aTelevisionAlwaysPauses() = assertTrue(stop(isTelevision = true, screenInteractive = false))

    @Test
    fun closingThePictureInPictureWindowPauses() = assertTrue(
        shouldPauseOnPictureInPictureEnd(inPictureInPicture = false, activityStopped = true, dismissing = false)
    )

    // Expanding it brings the activity back to the front.
    @Test
    fun expandingThePictureInPictureWindowPlaysOn() = assertFalse(
        shouldPauseOnPictureInPictureEnd(inPictureInPicture = false, activityStopped = false, dismissing = false)
    )
}
