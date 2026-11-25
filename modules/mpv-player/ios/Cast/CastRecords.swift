#if os(iOS) && !targetEnvironment(macCatalyst)
import Foundation
import GoogleCast

/// SDK objects as the records the JS side declares in Cast.types.ts.
enum CastRecords {
  static func device(_ device: GCKDevice?) -> [String: Any?]? {
    guard let device else { return nil }
    return [
      "deviceId": device.deviceID,
      "friendlyName": device.friendlyName ?? "",
      "modelName": device.modelName,
    ]
  }

  static func session(_ session: GCKCastSession?) -> [String: Any?]? {
    guard let session, let id = session.sessionID else { return nil }
    return ["id": id, "device": device(session.device)]
  }

  static func mediaStatus(_ status: GCKMediaStatus?) -> [String: Any?]? {
    guard let status else { return nil }
    return [
      "playerState": CastMapping.playerStateName(status.playerState.rawValue),
      "currentItemId": status.currentItemID == kGCKMediaQueueInvalidItemID ? nil : Int(status.currentItemID),
      "streamPosition": status.streamPosition,
      "playbackRate": Double(status.playbackRate),
      "volume": Double(status.volume),
      "isMuted": status.isMuted,
      "mediaInfo": mediaInfo(status.mediaInformation),
      "customData": status.customData,
    ]
  }

  private static func mediaInfo(_ info: GCKMediaInformation?) -> [String: Any?]? {
    guard let info else { return nil }
    return [
      "contentId": info.contentID,
      "customData": info.customData,
      "metadata": metadata(info.metadata),
    ]
  }

  private static func metadata(_ metadata: GCKMediaMetadata?) -> [String: Any?]? {
    guard let metadata else { return nil }
    return [
      "title": metadata.string(forKey: kGCKMetadataKeyTitle),
      "subtitle": metadata.string(forKey: kGCKMetadataKeySubtitle),
    ]
  }
}
#endif
