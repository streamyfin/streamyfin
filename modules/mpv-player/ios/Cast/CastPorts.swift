import Foundation

// What the Cast engine needs from the Cast SDK, in plain types: GoogleCastPorts.swift implements these
// and the harness fakes them, so the engine never touches a GoogleCast type. No platform guard.

/// One media status as the SDK reported it, with the names of CastMapping.
struct CastMediaSnapshot {
  var playerState: String
  var idleReason: String
  var hasMedia: Bool
  var streamPosition: TimeInterval
  var playbackRate: Double
  var customData: [String: Any]?
  var streamDuration: TimeInterval
  var hasTextTracks: Bool
}

protocol CastMediaListener: AnyObject {
  func castMediaDidUpdateStatus()
}

/// The media channel of one session. A resume hands a new object, never the old one again.
protocol CastMediaPort: AnyObject {
  var status: CastMediaSnapshot? { get }
  var approximatePosition: TimeInterval { get }
  var listener: CastMediaListener? { get set }
  func play()
  func pause()
  func seek(to position: TimeInterval, completion: @escaping (Bool) -> Void)
  func requestStatus()
}

protocol CastSessionPort: AnyObject {
  var sessionId: String? { get }
  var isConnected: Bool { get }
  var media: CastMediaPort? { get }
  var volume: Double? { get }
  func setVolume(_ level: Double)
  func setMute(_ muted: Bool)
}

protocol CastSessionListener: AnyObject {
  func castSessionDidSuspend(sessionId: String?)
  func castSessionDidResume(_ session: CastSessionPort)
  func castSessionDidEnd(sessionId: String?, error: String?)
  func castSessionDidReceiveVolume(_ volume: Double, muted: Bool)
}

protocol CastSessionSource: AnyObject {
  var current: CastSessionPort? { get }
  var listener: CastSessionListener? { get set }
}

/// How a load ended: settled by what the receiver reported, or never sent.
enum CastLoadResult {
  case settled(ReceiverLoadOutcome)
  case notSent(String)
}

/// Told when the engine loses its session; the error is nil for an end the user asked for.
protocol CastBindingListener: AnyObject {
  func castEngineDidLoseBinding(sessionId: String?, error: String?)
}
