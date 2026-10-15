package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncPlayBackgroundPolicyTest {
    private fun stopped(
        ownsActivity: Boolean = true,
        syncPlayActive: Boolean = true,
        inPictureInPicture: Boolean = false,
        changingConfigurations: Boolean = false,
        dismissing: Boolean = false
    ) = shouldLeaveSyncPlayOnActivityStop(
        ownsActivity, syncPlayActive, inPictureInPicture, changingConfigurations, dismissing
    )

    @Test fun nativePipTruthKeepsGroupWhenJsBackgroundArrivesFirst() {
        assertFalse(stopped(inPictureInPicture = true))
        assertTrue(stopped(inPictureInPicture = false))
    }

    @Test fun unrelatedActivityStoppingCannotPauseOrLeavePlayerGroup() {
        assertFalse(stopped(ownsActivity = false))
        assertTrue(stopped())
    }

    @Test fun sharedStopDismissalKeepsMembershipForLobbyRestart() {
        assertFalse(stopped(dismissing = true))
    }

    @Test fun rotationAndSoloPlaybackDoNotAcquireGroupBackgroundBehavior() {
        assertFalse(stopped(changingConfigurations = true))
        assertFalse(stopped(syncPlayActive = false))
    }

    private fun pipEnded(
        inPictureInPicture: Boolean = false,
        activityStopped: Boolean = true,
        syncPlayActive: Boolean = true,
        dismissing: Boolean = false
    ) = shouldLeaveSyncPlayOnPictureInPictureEnd(
        inPictureInPicture, activityStopped, syncPlayActive, dismissing
    )

    // The stop that closing a PiP window causes still reports PiP, so the
    // stop rule lets it pass: without this one the member plays on unseen.
    @Test fun closingThePipWindowLeavesTheGroup() {
        assertFalse(stopped(inPictureInPicture = true))
        assertTrue(pipEnded())
    }

    @Test fun expandingPipBackToFullScreenKeepsTheGroup() {
        assertFalse(pipEnded(activityStopped = false))
    }

    @Test fun enteringPipSoloPlaybackAndPlayerDismissalAreNotAPipClose() {
        assertFalse(pipEnded(inPictureInPicture = true))
        assertFalse(pipEnded(syncPlayActive = false))
        assertFalse(pipEnded(dismissing = true))
    }
}
