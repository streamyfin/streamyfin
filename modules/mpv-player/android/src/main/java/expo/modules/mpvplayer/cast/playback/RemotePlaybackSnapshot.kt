package expo.modules.mpvplayer.cast.playback

import expo.modules.mpvplayer.nativeplayer.engine.RemotePhase

/** What the TV plays, as the holder publishes it (RemotePlaybackState in Cast.types.ts). Track indexes are Jellyfin's, -1 unknown. */
data class RemotePlaybackSnapshot(
    /** A session holds, suspended included, and there is a server to play from. */
    val connected: Boolean,
    val phase: RemotePhase,
    val reconnecting: Boolean,
    val itemId: String?,
    val positionSec: Double,
    val durationSec: Double,
    val audioIndex: Int,
    val subtitleIndex: Int,
    val queueItemIds: List<String>,
    val playingIndex: Int,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "connected" to connected,
        "phase" to phase.name.lowercase(),
        "reconnecting" to reconnecting,
        "itemId" to itemId,
        "positionSec" to positionSec,
        "durationSec" to durationSec,
        "audioIndex" to audioIndex,
        "subtitleIndex" to subtitleIndex,
        "queueItemIds" to queueItemIds,
        "playingIndex" to playingIndex,
    )

    companion object {
        val NONE = RemotePlaybackSnapshot(
            connected = false,
            phase = RemotePhase.NONE,
            reconnecting = false,
            itemId = null,
            positionSec = 0.0,
            durationSec = 0.0,
            audioIndex = -1,
            subtitleIndex = -1,
            queueItemIds = emptyList(),
            playingIndex = -1,
        )
    }
}
