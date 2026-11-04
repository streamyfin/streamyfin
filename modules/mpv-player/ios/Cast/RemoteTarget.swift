import Foundation

/// A receiver the SDK can reach, as discovery lists it.
struct TargetDevice: Equatable {
  let id: String
  let name: String
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

/// Turns the session events the module already emits (onSessionEvent) into the target state. The
/// SDK ends a session before it starts the next one, so a device switch goes through `ending` and
/// `none`, and no state ever pairs one device's id with another's name. Pure: the hub feeds it and
/// publishes what changed.
final class RemoteTargetMachine {
  private(set) var snapshot = RemoteTargetSnapshot.none

  /// A connection asked from this phone; the SDK's own events follow. Ignored unless nothing is connected.
  func connectRequested(_ device: TargetDevice) -> Bool {
    guard snapshot.phase == .none else { return false }
    return update(RemoteTargetSnapshot(phase: .connecting, target: .cast(device), reconnecting: false, error: nil))
  }

  /// True when the state changed. An event without its device keeps the target already known.
  func sessionEvent(_ event: String, device: TargetDevice?, error: String?) -> Bool {
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
}
