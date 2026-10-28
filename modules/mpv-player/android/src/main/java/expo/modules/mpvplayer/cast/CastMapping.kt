package expo.modules.mpvplayer.cast

import com.google.android.gms.cast.CastStatusCodes
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastState
import com.google.android.gms.common.ConnectionResult

/**
 * The SDK's integer codes as the names the JS side reads (see Cast.types.ts). Pure, so the
 * unit tests pin the vocabulary without a device.
 */
object CastMapping {
    fun castStateName(state: Int): String? = when (state) {
        CastState.NO_DEVICES_AVAILABLE -> "noDevicesAvailable"
        CastState.NOT_CONNECTED -> "notConnected"
        CastState.CONNECTING -> "connecting"
        CastState.CONNECTED -> "connected"
        else -> null
    }

    fun playServicesStateName(code: Int): String = when (code) {
        ConnectionResult.SUCCESS -> "success"
        ConnectionResult.SERVICE_MISSING -> "missing"
        ConnectionResult.SERVICE_UPDATING -> "updating"
        ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED -> "updateRequired"
        ConnectionResult.SERVICE_DISABLED -> "disabled"
        else -> "invalid"
    }

    fun playerStateName(state: Int): String = when (state) {
        MediaStatus.PLAYER_STATE_IDLE -> "idle"
        MediaStatus.PLAYER_STATE_PLAYING -> "playing"
        MediaStatus.PLAYER_STATE_PAUSED -> "paused"
        MediaStatus.PLAYER_STATE_BUFFERING -> "buffering"
        MediaStatus.PLAYER_STATE_LOADING -> "loading"
        else -> "unknown"
    }

    /**
     * Null only when the user ended the session (the SDK reports success), which also closes
     * the receiver app; any other end may leave the TV playing and the stop reporter checks.
     */
    fun sessionEndError(errorCode: Int): String? =
        if (errorCode == CastStatusCodes.SUCCESS) null
        else "${CastStatusCodes.getStatusCodeString(errorCode)} ($errorCode)"
}
