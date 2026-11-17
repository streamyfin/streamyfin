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
      maxBitrate: maxBitrate.map { Int64($0) }
    )
  }
}
