import Foundation

/// The SDK's raw enum values as the names the JS side reads (see Cast.types.ts). No
/// GoogleCast import, so the harness in scripts/ios/test-cast-mapping.sh compiles it alone.
enum CastMapping {
  static let receiverAppIdKey = "StreamyfinCastReceiverAppId"
  static let defaultReceiverAppId = "F007D354"
  /// Lets the SDK present its expanded controls when the user taps the playing media in the Cast
  /// dialog or the mini controller, as react-native-google-cast set it.
  static let useDefaultExpandedMediaControls = true

  /// GCKCastState: noDevicesAvailable 0, notConnected 1, connecting 2, connected 3.
  static func castStateName(_ rawValue: Int) -> String? {
    switch rawValue {
    case 0: return "noDevicesAvailable"
    case 1: return "notConnected"
    case 2: return "connecting"
    case 3: return "connected"
    default: return nil
    }
  }

  /// GCKMediaPlayerState: unknown 0, idle 1, playing 2, paused 3, buffering 4, loading 5.
  static func playerStateName(_ rawValue: Int) -> String {
    switch rawValue {
    case 1: return "idle"
    case 2: return "playing"
    case 3: return "paused"
    case 4: return "buffering"
    case 5: return "loading"
    default: return "unknown"
    }
  }

  /// Nil only when the session ended without an error, which the SDK reports for a stop
  /// asked from this phone; that stop also closes the receiver app. Any other end may leave
  /// the TV playing, and the stop reporter checks on it.
  static func sessionEndError(_ error: Error?) -> String? {
    guard let error = error as NSError? else { return nil }
    return "\(error.domain) \(error.code): \(error.localizedDescription)"
  }

  /// The receiver id the config plugin wrote to the Info.plist, Jellyfin's receiver by default.
  static func receiverAppId(fromInfoPlist info: [String: Any]) -> String {
    guard let id = info[receiverAppIdKey] as? String, !id.isEmpty else { return defaultReceiverAppId }
    return id
  }
}
