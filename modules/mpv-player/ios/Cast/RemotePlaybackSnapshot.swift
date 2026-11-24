import Foundation

/// What the TV plays, as the holder publishes it (RemotePlaybackState in Cast.types.ts). Track indexes are
/// Jellyfin's, -1 unknown.
struct RemotePlaybackSnapshot: Equatable {
  static let none = RemotePlaybackSnapshot(
    connected: false, phase: .none, reconnecting: false, itemId: nil, positionSec: 0, durationSec: 0, audioIndex: -1,
    subtitleIndex: -1, queueItemIds: [], playingIndex: -1, foreign: false, title: nil, imageUrl: nil
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
  /// Media without our receiver's item id, and the title and image its Cast metadata names (any media's).
  var foreign: Bool
  var title: String?
  var imageUrl: String?
  /// How the TV plays it, in the receiver's word; nil unknown.
  var playMethod: String? = nil
  /// Idle on a Stop (TV remote or a sender), not on an error, which `stopped` also covers. Native only.
  var stopRequested = false

  func toDictionary() -> [String: Any?] {
    [
      "connected": connected, "phase": phase.rawValue, "reconnecting": reconnecting, "itemId": itemId,
      "positionSec": positionSec, "durationSec": durationSec, "audioIndex": audioIndex, "subtitleIndex": subtitleIndex,
      "queueItemIds": queueItemIds, "playingIndex": playingIndex, "foreign": foreign, "title": title,
      "imageUrl": imageUrl, "playMethod": playMethod,
    ]
  }
}
