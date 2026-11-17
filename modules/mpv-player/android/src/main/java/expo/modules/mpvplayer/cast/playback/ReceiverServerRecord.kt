package expo.modules.mpvplayer.cast.playback

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.mpvplayer.cast.receiver.ReceiverServer

/** The server JS hands the remote engine (ReceiverServerRecord in Cast.types.ts). */
class ReceiverServerRecord : Record {
    @Field val serverAddress: String = ""
    @Field val accessToken: String = ""
    @Field val userId: String = ""
    @Field val receiverName: String? = null
    @Field val maxBitrate: Double? = null

    fun toServer() = ReceiverServer(serverAddress, accessToken, userId, receiverName, maxBitrate?.toLong())
}
