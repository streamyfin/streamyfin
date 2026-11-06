package expo.modules.mpvplayer.cast

import com.google.android.gms.cast.CastStatusCodes
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.MediaTrack
import com.google.android.gms.cast.framework.CastReasonCodes
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

    /** Why the receiver went idle; the engine tells a natural end from a playback error by it. */
    fun idleReasonName(reason: Int): String = when (reason) {
        MediaStatus.IDLE_REASON_FINISHED -> "finished"
        MediaStatus.IDLE_REASON_CANCELED -> "cancelled"
        MediaStatus.IDLE_REASON_INTERRUPTED -> "interrupted"
        MediaStatus.IDLE_REASON_ERROR -> "error"
        else -> "none"
    }

    /**
     * Something plays on the receiver, with a title or without. Not once it stopped: a stop from the TV keeps the
     * idle media and its metadata, and the output sheet would offer to stop it again.
     */
    fun isPlaying(playerState: Int): Boolean = when (playerState) {
        MediaStatus.PLAYER_STATE_PLAYING,
        MediaStatus.PLAYER_STATE_PAUSED,
        MediaStatus.PLAYER_STATE_BUFFERING,
        MediaStatus.PLAYER_STATE_LOADING,
        -> true
        else -> false
    }

    /** The title of what the receiver plays, none once it stopped. */
    fun playingTitle(playerState: Int, title: String?): String? = if (isPlaying(playerState)) title else null

    /**
     * Whether this phone can go on with the receiver's media: a Jellyfin item (media another sender loaded has none),
     * neither live TV, whose position means nothing here, nor audio, whose queue goes back with B4. The Jellyfin
     * receiver gives its Audio items the music track metadata type, and every audio item, an audiobook among them
     * (generic metadata), an audio/ content type.
     */
    fun goesOnHere(metadataType: Int?, contentType: String?, itemId: String?, liveStreamId: String?): Boolean =
        itemId != null && liveStreamId == null && metadataType != MediaMetadata.MEDIA_TYPE_MUSIC_TRACK &&
            contentType?.startsWith("audio/", ignoreCase = true) != true

    /**
     * A subtitle change goes over the bus only when the media carries text tracks; without any, the
     * receiver has to reload the stream to burn the subtitles in.
     */
    fun hasTextTracks(trackTypes: List<Int>): Boolean = trackTypes.any { it == MediaTrack.TYPE_TEXT }

    /**
     * Null only when casting was stopped from this phone, which also closes the receiver app;
     * any other end may leave the TV playing and the stop reporter checks. The SDK reports that
     * stop as success or under a status code of its own (2154 on 22.3.1), which `reasonCode`,
     * CastContext's reading of it, gives as CASTING_STOPPED.
     */
    fun sessionEndError(errorCode: Int, reasonCode: Int): String? =
        if (errorCode == CastStatusCodes.SUCCESS || reasonCode == CastReasonCodes.CASTING_STOPPED) null
        else "${CastStatusCodes.getStatusCodeString(errorCode)} ($errorCode)"
}
