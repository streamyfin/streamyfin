package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncPlayQueueControlPolicyTest {
    // The queue's controls stay enabled so TV focus has somewhere to stay:
    // this is what stands between a held button and a second request.
    @Test fun keepingFocusDoesNotPermitDuplicateOrDisconnectedRequests() {
        assertFalse(syncPlayQueueActionAllowed(available = true, busy = true))
        assertFalse(syncPlayQueueActionAllowed(available = false, busy = false))
        assertTrue(syncPlayQueueActionAllowed(available = true, busy = false))
    }
}
