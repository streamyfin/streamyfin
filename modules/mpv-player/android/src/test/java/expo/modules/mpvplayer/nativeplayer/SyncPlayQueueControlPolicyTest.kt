package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.*
import org.junit.Test

class SyncPlayQueueControlPolicyTest {
    @Test fun tvRequestKeepsTheSameFocusableControlThroughoutBusyTransition() {
        assertEquals(listOf(true, true, true), listOf(false, true, false).map {
            syncPlayQueueControlEnabled(available = true, busy = it, isTv = true)
        })
    }

    @Test fun unavailableQueueNavigationAndDisconnectedControlsStayDisabledOnTv() {
        listOf(false, true).forEach { busy ->
            assertFalse(syncPlayQueueControlEnabled(available = false, busy = busy, isTv = true))
        }
    }

    @Test fun phoneControlsKeepTheirExistingBusyDisabledBehavior() {
        assertTrue(syncPlayQueueControlEnabled(available = true, busy = false, isTv = false))
        assertFalse(syncPlayQueueControlEnabled(available = true, busy = true, isTv = false))
    }

    @Test fun tvControlThatFollowsTheQueueKeepsItsFocusNodeWhenTheQueueMovesOn() {
        assertEquals(listOf(true, true), listOf(true, false).map {
            syncPlayQueueGatedControlEnabled(enabled = true, capable = it, isTv = true)
        })
        assertFalse(syncPlayQueueGatedControlEnabled(enabled = false, capable = true, isTv = true))
    }

    @Test fun phoneControlThatFollowsTheQueueIsDisabledWhenItCannotAct() {
        assertTrue(syncPlayQueueGatedControlEnabled(enabled = true, capable = true, isTv = false))
        assertFalse(syncPlayQueueGatedControlEnabled(enabled = true, capable = false, isTv = false))
    }

    @Test fun retainingTvFocusDoesNotPermitDuplicateOrDisconnectedRequests() {
        assertFalse(syncPlayQueueActionAllowed(available = true, busy = true))
        assertFalse(syncPlayQueueActionAllowed(available = false, busy = false))
        assertTrue(syncPlayQueueActionAllowed(available = true, busy = false))
    }
}
