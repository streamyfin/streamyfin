import Foundation

/// A receiver the SDK can reach, as discovery lists it.
struct TargetDevice: Equatable {
  let id: String
  let name: String
  let model: String?

  init(id: String, name: String, model: String? = nil) {
    self.id = id
    self.name = name
    self.model = model
  }

  /// The CastDevice record of Cast.types.ts, which onDevicesChanged publishes.
  func toDictionary() -> [String: Any?] {
    ["deviceId": id, "friendlyName": name, "modelName": model]
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
}

/// The raw values are the names JS reads.
enum TargetPhase: String {
  case none, connecting, connected, ending
}

/// The state published to JS (RemoteTargetState in Cast.types.ts).
struct RemoteTargetSnapshot: Equatable {
  static let none = RemoteTargetSnapshot(phase: .none, target: nil, reconnecting: false, error: nil)

  let phase: TargetPhase
  let target: RemoteTarget?
  let reconnecting: Bool
  /// Why the last session ended; nil when it did not end, or when the user ended it.
  let error: String?

  func toDictionary() -> [String: Any?] {
    [
      "state": phase.rawValue,
      "target": target.map { target -> [String: Any?] in
        ["kind": target.kind, "id": target.id, "name": target.name, "capabilities": ["volume": target.volume]]
      },
      "reconnecting": reconnecting,
      "error": error,
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

  /// A connection asked from this phone; the SDK's own events follow. Over another receiver, a switch starts.
  func connectRequested(_ device: TargetDevice) -> Bool {
    guard snapshot.phase == .none else {
      if snapshot.target?.id != device.id { switchingTo = device }
      return false
    }
    switchingTo = nil
    return update(RemoteTargetSnapshot(phase: .connecting, target: .cast(device), reconnecting: false, error: nil))
  }

  /// A disconnection asked from this phone: a switch on its way goes with the session.
  func disconnectRequested() {
    switchingTo = nil
  }

  /// True when the state changed. An event without its device keeps the target already known.
  func sessionEvent(_ event: String, device: TargetDevice?, error: String?) -> Bool {
    let failure = event == "ended" || event == "startFailed"
    if failure, let switching = switchingTo, device?.id == switching.id {
      // The asked receiver failed: once the old session ended it was the target, before that nothing moves.
      switchingTo = nil
      guard snapshot.target?.id == switching.id else { return false }
      return update(RemoteTargetSnapshot(phase: .none, target: nil, reconnecting: false, error: error))
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
      next = RemoteTargetSnapshot(phase: .none, target: nil, reconnecting: false, error: error)
    default:
      return false
    }
    return update(next)
  }

  private func update(_ next: RemoteTargetSnapshot) -> Bool {
    guard next != snapshot else { return false }
    snapshot = next
    return true
  }

  private func heldOtherThan(_ device: TargetDevice) -> Bool {
    guard let held = snapshot.target, snapshot.phase == .connecting || snapshot.phase == .connected else { return false }
    return held.id != device.id
  }
}
