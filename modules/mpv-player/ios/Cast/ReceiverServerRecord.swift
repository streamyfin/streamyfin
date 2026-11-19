import ExpoModulesCore

/// The server JS hands the remote engine (ReceiverServerRecord in Cast.types.ts).
struct ReceiverServerRecord: Record {
  @Field var serverAddress: String = ""
  @Field var accessToken: String = ""
  @Field var userId: String = ""
  @Field var receiverName: String?
  @Field var maxBitrate: Double?

  var server: ReceiverServer {
    ReceiverServer(
      serverAddress: serverAddress, accessToken: accessToken, userId: userId, receiverName: receiverName,
      maxBitrate: ReceiverProtocol.whole(fromJs: maxBitrate)
    )
  }
}

/// One item of a load (ReceiverPlayItem in Cast.types.ts): what the receiver reads, it fetches the rest.
struct ReceiverPlayItemRecord: Record {
  @Field var id: String = ""
  @Field var name: String?
  @Field var type: String?
  @Field var mediaType: String?
  @Field var isFolder: Bool = false
}

/// What JS asks the TV to play (ReceiverPlayRequest in Cast.types.ts).
struct ReceiverPlayRequestRecord: Record {
  @Field var items: [ReceiverPlayItemRecord] = []
  @Field var startIndex: Int?
  @Field var startPositionTicks: Double?
  @Field var mediaSourceId: String?
  @Field var audioStreamIndex: Int?
  @Field var subtitleStreamIndex: Int?
  @Field var liveStreamId: String?

  var request: ReceiverPlayRequest {
    ReceiverPlayRequest(
      items: items.map { ReceiverItem(id: $0.id, name: $0.name, type: $0.type, mediaType: $0.mediaType, isFolder: $0.isFolder) },
      startIndex: startIndex, startPositionTicks: ReceiverProtocol.whole(fromJs: startPositionTicks),
      mediaSourceId: mediaSourceId, audioStreamIndex: audioStreamIndex, subtitleStreamIndex: subtitleStreamIndex,
      liveStreamId: liveStreamId
    )
  }
}
