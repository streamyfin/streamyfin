package expo.modules.mpvplayer.cast

import com.google.android.gms.cast.CastStatusCodes
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.MediaTrack
import com.google.android.gms.cast.framework.CastReasonCodes
import com.google.android.gms.cast.framework.CastState
import com.google.android.gms.common.ConnectionResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        assertNull(CastMapping.sessionEndError(CastStatusCodes.SUCCESS, CastReasonCodes.UNKNOWN_REASON))
        val error = CastMapping.sessionEndError(CastStatusCodes.NETWORK_ERROR, CastReasonCodes.NETWORK_ERROR)
        assertNotNull(error)
        assertTrue(error!!.endsWith("(${CastStatusCodes.NETWORK_ERROR})"))
    }

    // The engine tells an end from an error by why the receiver went idle.
    @Test
    fun idleReasonsMapToTheReceiverNames() {
        assertEquals("none", CastMapping.idleReasonName(MediaStatus.IDLE_REASON_NONE))
        assertEquals("finished", CastMapping.idleReasonName(MediaStatus.IDLE_REASON_FINISHED))
        assertEquals("cancelled", CastMapping.idleReasonName(MediaStatus.IDLE_REASON_CANCELED))
        assertEquals("interrupted", CastMapping.idleReasonName(MediaStatus.IDLE_REASON_INTERRUPTED))
        assertEquals("error", CastMapping.idleReasonName(MediaStatus.IDLE_REASON_ERROR))
        assertEquals("none", CastMapping.idleReasonName(42))
    }

    // A subtitle change goes over the bus only when the media has text tracks; without any, it reloads.
    @Test
    fun anIdleReceiverPlaysNothing() {
        assertTrue(CastMapping.isPlaying(MediaStatus.PLAYER_STATE_PLAYING))
        assertTrue(CastMapping.isPlaying(MediaStatus.PLAYER_STATE_PAUSED))
        assertTrue(CastMapping.isPlaying(MediaStatus.PLAYER_STATE_BUFFERING))
        assertTrue(CastMapping.isPlaying(MediaStatus.PLAYER_STATE_LOADING))
        assertFalse(CastMapping.isPlaying(MediaStatus.PLAYER_STATE_IDLE))
        assertFalse(CastMapping.isPlaying(MediaStatus.PLAYER_STATE_UNKNOWN))
    }

    // A stop from the TV leaves the idle media with its metadata: the sheet must not offer to stop it again.
    @Test
    fun onlyAPlayingReceiverHasATitle() {
        val title = "Big Buck Bunny"
        assertEquals(title, CastMapping.playingTitle(MediaStatus.PLAYER_STATE_PLAYING, title))
        assertEquals(title, CastMapping.playingTitle(MediaStatus.PLAYER_STATE_PAUSED, title))
        assertEquals(title, CastMapping.playingTitle(MediaStatus.PLAYER_STATE_BUFFERING, title))
        assertEquals(title, CastMapping.playingTitle(MediaStatus.PLAYER_STATE_LOADING, title))
        assertEquals(null, CastMapping.playingTitle(MediaStatus.PLAYER_STATE_IDLE, title))
        assertEquals(null, CastMapping.playingTitle(MediaStatus.PLAYER_STATE_UNKNOWN, title))
    }

    @Test
    fun textTracksAreTheTracksOfTypeText() {
        assertTrue(CastMapping.hasTextTracks(listOf(MediaTrack.TYPE_AUDIO, MediaTrack.TYPE_TEXT)))
        assertFalse(CastMapping.hasTextTracks(listOf(MediaTrack.TYPE_AUDIO, MediaTrack.TYPE_VIDEO)))
        assertFalse(CastMapping.hasTextTracks(emptyList()))
    }

    // Seen on a device with SDK 22.3.1: "Stop casting" ends the session with 2154 and a lost
    // network with 2155, codes CastStatusCodes does not name. Only CastContext resolves them,
    // the stop to CASTING_STOPPED, as react-native-google-cast read them.
    @Test
    fun aStopTheSdkReportsUnderItsOwnCodeHasNoError() {
        assertNull(CastMapping.sessionEndError(2154, CastReasonCodes.CASTING_STOPPED))
        val lost = CastMapping.sessionEndError(2155, CastReasonCodes.NETWORK_ERROR)
        assertNotNull(lost)
        assertTrue(lost!!.endsWith("(2155)"))
    }
}
