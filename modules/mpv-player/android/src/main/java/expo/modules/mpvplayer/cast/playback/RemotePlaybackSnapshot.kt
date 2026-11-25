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
    /** Media without our receiver's item id, and the title and image its Cast metadata names (any media's). */
    val foreign: Boolean,
    val title: String?,
    val imageUrl: String?,
    /** How the TV plays it, in the receiver's word; null unknown. */
    val playMethod: String? = null,
    /** Idle on a Stop (TV remote or a sender), not on an error, which [RemotePhase.STOPPED] also covers. Native only. */
    val stopRequested: Boolean = false,
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
        "foreign" to foreign,
        "title" to title,
        "imageUrl" to imageUrl,
        "playMethod" to playMethod,
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
            foreign = false,
            title = null,
            imageUrl = null,
        )
    }
}
