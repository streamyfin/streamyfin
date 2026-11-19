package expo.modules.mpvplayer.cast.playback

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.mpvplayer.cast.receiver.ReceiverItem
import expo.modules.mpvplayer.cast.receiver.ReceiverPlayRequest
import expo.modules.mpvplayer.cast.receiver.ReceiverProtocol
import expo.modules.mpvplayer.cast.receiver.ReceiverServer

/** The server JS hands the remote engine (ReceiverServerRecord in Cast.types.ts). */
class ReceiverServerRecord : Record {
    @Field val serverAddress: String = ""
    @Field val accessToken: String = ""
    @Field val userId: String = ""
    @Field val receiverName: String? = null
    @Field val maxBitrate: Double? = null

    fun toServer() = ReceiverServer(serverAddress, accessToken, userId, receiverName, ReceiverProtocol.wholeFromJs(maxBitrate))
}

/** One item of a load (ReceiverPlayItem in Cast.types.ts): what the receiver reads, it fetches the rest. */
class ReceiverPlayItemRecord : Record {
    @Field val id: String = ""
    @Field val name: String? = null
    @Field val type: String? = null
    @Field val mediaType: String? = null
    @Field val isFolder: Boolean = false
}

/** What JS asks the TV to play (ReceiverPlayRequest in Cast.types.ts). */
class ReceiverPlayRequestRecord : Record {
    @Field val items: List<ReceiverPlayItemRecord> = emptyList()
    @Field val startIndex: Int? = null
    @Field val startPositionTicks: Double? = null
    @Field val mediaSourceId: String? = null
    @Field val audioStreamIndex: Int? = null
    @Field val subtitleStreamIndex: Int? = null
    @Field val liveStreamId: String? = null

    fun toRequest() = ReceiverPlayRequest(
        items = items.map { ReceiverItem(id = it.id, name = it.name, type = it.type, mediaType = it.mediaType, isFolder = it.isFolder) },
        startIndex = startIndex,
        startPositionTicks = ReceiverProtocol.wholeFromJs(startPositionTicks),
        mediaSourceId = mediaSourceId,
        audioStreamIndex = audioStreamIndex,
        subtitleStreamIndex = subtitleStreamIndex,
        liveStreamId = liveStreamId,
    )
}
