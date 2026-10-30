package expo.modules.mpvplayer.cast

import com.google.android.gms.cast.CastStatusCodes
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastState
import com.google.android.gms.common.ConnectionResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The JS side keys on these names; a renamed state would silently break every screen.
class CastMappingTest {
    @Test
    fun castStateCodesMapToTheJsNames() {
        assertEquals("noDevicesAvailable", CastMapping.castStateName(CastState.NO_DEVICES_AVAILABLE))
        assertEquals("notConnected", CastMapping.castStateName(CastState.NOT_CONNECTED))
        assertEquals("connecting", CastMapping.castStateName(CastState.CONNECTING))
        assertEquals("connected", CastMapping.castStateName(CastState.CONNECTED))
        assertNull(CastMapping.castStateName(99))
    }

    @Test
    fun playServicesCodesMapToTheJsNames() {
        assertEquals("success", CastMapping.playServicesStateName(ConnectionResult.SUCCESS))
        assertEquals("missing", CastMapping.playServicesStateName(ConnectionResult.SERVICE_MISSING))
        assertEquals("updating", CastMapping.playServicesStateName(ConnectionResult.SERVICE_UPDATING))
        assertEquals("updateRequired", CastMapping.playServicesStateName(ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED))
        assertEquals("disabled", CastMapping.playServicesStateName(ConnectionResult.SERVICE_DISABLED))
        assertEquals("invalid", CastMapping.playServicesStateName(ConnectionResult.SERVICE_INVALID))
        assertEquals("invalid", CastMapping.playServicesStateName(ConnectionResult.API_UNAVAILABLE))
    }

    @Test
    fun playerStatesMapToTheJsNames() {
        assertEquals("idle", CastMapping.playerStateName(MediaStatus.PLAYER_STATE_IDLE))
        assertEquals("playing", CastMapping.playerStateName(MediaStatus.PLAYER_STATE_PLAYING))
        assertEquals("paused", CastMapping.playerStateName(MediaStatus.PLAYER_STATE_PAUSED))
        assertEquals("buffering", CastMapping.playerStateName(MediaStatus.PLAYER_STATE_BUFFERING))
        assertEquals("loading", CastMapping.playerStateName(MediaStatus.PLAYER_STATE_LOADING))
        assertEquals("unknown", CastMapping.playerStateName(MediaStatus.PLAYER_STATE_UNKNOWN))
        assertEquals("unknown", CastMapping.playerStateName(42))
    }

    // The stop reporter takes a session that ended without an error for a cast the user
    // stopped, which also closed the receiver app; anything else may leave the TV playing.
    @Test
    fun onlyASessionTheUserEndedHasNoError() {
        assertNull(CastMapping.sessionEndError(CastStatusCodes.SUCCESS))
        val error = CastMapping.sessionEndError(CastStatusCodes.NETWORK_ERROR)
        assertNotNull(error)
        assertTrue(error!!.endsWith("(${CastStatusCodes.NETWORK_ERROR})"))
    }
}
