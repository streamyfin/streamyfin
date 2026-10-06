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
}
