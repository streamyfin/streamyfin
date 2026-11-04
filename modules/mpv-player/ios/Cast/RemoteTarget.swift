import Foundation

/// A receiver the SDK can reach, as discovery lists it; `videoOut` tells a screen from a speaker.
struct TargetDevice: Equatable {
  let id: String
  let name: String
  let model: String?
  let videoOut: Bool

  init(id: String, name: String, model: String? = nil, videoOut: Bool = true) {
    self.id = id
    self.name = name
    self.model = model
    self.videoOut = videoOut
  }

  /// The CastDevice record of Cast.types.ts, which onDevicesChanged publishes.
  func toDictionary() -> [String: Any?] {
    ["deviceId": id, "friendlyName": name, "modelName": model, "videoOut": videoOut]
  }
}

/// Where playback goes. Only Cast targets exist for now; Play On and AirPlay come with their engines.
struct RemoteTarget: Equatable {
  static let kindCast = "cast"

  let kind: String
  let id: String
  let name: String
  let volume: Bool

  /// Every Cast receiver takes a volume and a mute from the sender.
  static func cast(_ device: TargetDevice) -> RemoteTarget {
    RemoteTarget(kind: kindCast, id: device.id, name: device.name, volume: true)
  }

  func toDictionary() -> [String: Any?] {
    ["kind": kind, "id": id, "name": name, "capabilities": ["volume": volume]]
  }
}

/// The raw values are the names JS reads.
enum TargetPhase: String {
  case none, connecting, connected, ending
}

/// The state published to JS (RemoteTargetState in Cast.types.ts).
struct RemoteTargetSnapshot: Equatable {
  static let none = RemoteTargetSnapshot(phase: .none, target: nil, reconnecting: false, error: nil)

  var phase: TargetPhase
  var target: RemoteTarget?
  var reconnecting: Bool
  /// Why the last session ended, or why a request the port refused at once did not move the session
  /// that holds; nil when nothing went wrong, or when the user ended it.
  var error: String?
  /// The receiver's own volume, 0 to 1, as the SDK last reported it for this session; nil before.
  var volume: Double?
  var muted = false
  /// The SDK's status code for `error`, and the receiver it belongs to: nil with no error, and the code
  /// nil as well for a refusal of the port's own.
  var errorCode: Int?
  var failedTarget: RemoteTarget?

  func withError(_ error: String?) -> RemoteTargetSnapshot {
    var next = self
    next.error = error
    return next
  }

  func toDictionary() -> [String: Any?] {
    [
      "state": phase.rawValue,
      "target": target?.toDictionary(),
      "reconnecting": reconnecting,
      "error": error,
      "volume": volume,
      "muted": muted,
      "errorCode": errorCode,
      "failedTarget": failedTarget?.toDictionary(),
    ]
  }
}

/// Turns the session events the module already emits (onSessionEvent) into the target state. A switch
/// ends one session before it starts the next: the old session's end, whatever status the SDK gives it
/// (2155 on Android), leads to the asked receiver, never to none. Nothing promises the old end arrives
/// first, so an end that names another receiver than the one connecting or connected leaves the state
/// alone. No state ever pairs one device's id with another's name. Pure: the hub feeds it and publishes
/// what changed.
final class RemoteTargetMachine {
  private static let endEvents: Set<String> = ["ending", "ended", "startFailed"]

  private(set) var snapshot = RemoteTargetSnapshot.none
  // The receiver asked for while another one held the session: the old session's end leads to it.
  private var switchingTo: TargetDevice?

  /// A switch is on its way: asking the receiver it leaves is a request again, not a no-op.
  var isSwitching: Bool { switchingTo != nil }

  /// A connection asked from this phone; the SDK's own events follow. Over another receiver, a switch
  /// starts; over the held one while a switch takes its session away, the last request wins.
  func connectRequested(_ device: TargetDevice) -> Bool {
    guard snapshot.phase == .none else {
      if snapshot.target?.id != device.id || switchingTo != nil { switchingTo = device }
      return false
    }
    switchingTo = nil
    return update(RemoteTargetSnapshot(phase: .connecting, target: .cast(device), reconnecting: false, error: nil))
  }

  /// A disconnection asked from this phone: a switch on its way goes with the session.
  func disconnectRequested() {
    switchingTo = nil
  }

  /// The receiver's volume, as the SDK reports it: held only for a session connecting or connected.
  func volumeChanged(level: Double, muted: Bool) -> Bool {
    guard snapshot.phase == .connecting || snapshot.phase == .connected else { return false }
    var next = snapshot
    next.volume = min(max(level, 0), 1)
    next.muted = muted
    guard next != snapshot else { return false }
    snapshot = next
    return true
  }

  /// True when the state changed. An event without its device keeps the target already known. `code` is
  /// the SDK's status code for `error`, when the SDK gave one.
  func sessionEvent(_ event: String, device: TargetDevice?, error: String?, code: Int? = nil) -> Bool {
    let failure = event == "ended" || event == "startFailed"
    // The only start in flight during a switch is the asked receiver's, so a start failure without its
    // device is that one's.
    let askedFailed = device?.id == switchingTo?.id || (device == nil && event == "startFailed")
    if failure, let switching = switchingTo, askedFailed {
      let held = snapshot.target?.id == switching.id
      // Asked back while a switch ended its session: that end leads to it again.
      if held && snapshot.phase != .connecting {
        return update(RemoteTargetSnapshot(phase: .connecting, target: .cast(switching), reconnecting: false, error: nil))
      }
      // The asked receiver failed. Once the old session ended it was the target; before that, the port
      // refused it at once, and the receiver holding the session stays, with the cause.
      switchingTo = nil
      guard held else { return update(failed(snapshot.withError(error), error, code, .cast(switching))) }
      let ended = RemoteTargetSnapshot(phase: .none, target: nil, reconnecting: false, error: error)
      return update(failed(ended, error, code, .cast(switching)))
    }
    if Self.endEvents.contains(event), let device, heldOtherThan(device) { return false }
    if failure, let switching = switchingTo {
      return update(RemoteTargetSnapshot(phase: .connecting, target: .cast(switching), reconnecting: false, error: nil))
    }
    if event == "started" || event == "resumed", let device, device.id == switchingTo?.id { switchingTo = nil }
    let target = device.map(RemoteTarget.cast) ?? snapshot.target
    let next: RemoteTargetSnapshot
    switch event {
    case "starting":
      next = RemoteTargetSnapshot(phase: .connecting, target: target, reconnecting: false, error: nil)
    case "started", "resumed":
      next = RemoteTargetSnapshot(phase: .connected, target: target, reconnecting: false, error: nil)
    case "suspended":
      // The SDK keeps trying a suspended session on its own: the same target, reconnecting.
      next = RemoteTargetSnapshot(phase: .connecting, target: snapshot.target, reconnecting: true, error: nil)
    case "resuming":
      next = RemoteTargetSnapshot(phase: .connecting, target: target, reconnecting: true, error: nil)
    case "ending":
      next = RemoteTargetSnapshot(phase: .ending, target: snapshot.target, reconnecting: false, error: nil)
    case "ended", "startFailed":
      next = failed(RemoteTargetSnapshot(phase: .none, target: nil, reconnecting: false, error: error), error, code, target)
    case "endRefused":
      // The SDK kept a session it was asked to end: it stays, with the cause.
      guard snapshot.phase != .none else { return false }
      next = failed(snapshot.withError(error), error, code, snapshot.target)
    default:
      return false
    }
    return update(next)
  }

  // An error names the receiver it belongs to and the SDK's code for it; no error names neither.
  private func failed(_ next: RemoteTargetSnapshot, _ error: String?, _ code: Int?, _ target: RemoteTarget?)
    -> RemoteTargetSnapshot
  {
    var named = next
    named.errorCode = error == nil ? nil : code
    named.failedTarget = error == nil ? nil : target
    return named
  }

  // The same session keeps the volume the SDK last reported; another target, or none, starts without one.
  private func update(_ next: RemoteTargetSnapshot) -> Bool {
    var carried = next
    let sameSession = next.phase != .none && next.target?.id == snapshot.target?.id
    carried.volume = sameSession ? snapshot.volume : nil
    carried.muted = sameSession ? snapshot.muted : false
    guard carried != snapshot else { return false }
    snapshot = carried
    return true
  }

  // An ending session is still held: a late end of the receiver before it must not end it.
  private func heldOtherThan(_ device: TargetDevice) -> Bool {
    guard let held = snapshot.target, snapshot.phase != .none else { return false }
    return held.id != device.id
  }
}
