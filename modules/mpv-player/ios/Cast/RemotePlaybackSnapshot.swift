import Foundation

/// What the TV plays, as the holder publishes it (RemotePlaybackState in Cast.types.ts). Track indexes are
/// Jellyfin's, -1 unknown.
struct RemotePlaybackSnapshot: Equatable {
  static let none = RemotePlaybackSnapshot(
    connected: false, phase: .none, reconnecting: false, itemId: nil, positionSec: 0, durationSec: 0, audioIndex: -1,
    subtitleIndex: -1, queueItemIds: [], playingIndex: -1
  )

  /// A session holds, suspended included, and there is a server to play from.
  var connected: Bool
  var phase: RemotePhase
  var reconnecting: Bool
  var itemId: String?
  var positionSec: Double
  var durationSec: Double
  var audioIndex: Int
  var subtitleIndex: Int
  var queueItemIds: [String]
  var playingIndex: Int

  func toDictionary() -> [String: Any?] {
    [
      "connected": connected, "phase": phase.rawValue, "reconnecting": reconnecting, "itemId": itemId,
      "positionSec": positionSec, "durationSec": durationSec, "audioIndex": audioIndex, "subtitleIndex": subtitleIndex,
      "queueItemIds": queueItemIds, "playingIndex": playingIndex,
    ]
  }
}
