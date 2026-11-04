import Foundation

// The output sheet reads where playback goes from this state alone, so every session event the SDK
// can send has to land on a state the sheet can draw. The same cases as RemoteTargetMachineTest.kt.
@main
enum RemoteTargetTests {
  static var failures: [String] = []
  static var cases = 0
  static let livingRoom = TargetDevice(id: "device-a", name: "Living room")
  static let bedroom = TargetDevice(id: "device-b", name: "Bedroom")

  static func check(_ name: String, _ ok: Bool) {
    cases += 1
    if !ok { failures.append(name) }
  }

  static func cast(_ device: TargetDevice) -> RemoteTarget {
    RemoteTarget(kind: "cast", id: device.id, name: device.name, volume: true)
  }

  static func state(_ phase: TargetPhase, _ target: RemoteTarget?, reconnecting: Bool = false, error: String? = nil)
    -> RemoteTargetSnapshot
  {
    RemoteTargetSnapshot(phase: phase, target: target, reconnecting: reconnecting, error: error)
  }

  static func connected(to device: TargetDevice) -> RemoteTargetMachine {
    let machine = RemoteTargetMachine()
    _ = machine.sessionEvent("started", device: device, error: nil)
    return machine
  }

  // A [String: Any?] lookup answers Any??: flattened, a key set to nil and a missing key both read nil.
  static func value(_ dictionary: [String: Any?]?, _ key: String) -> Any? {
    guard let dictionary, let entry = dictionary[key] else { return nil }
    return entry
  }

  static func main() {
    do {
      let machine = RemoteTargetMachine()
      let requested = machine.connectRequested(livingRoom)
      let connecting = machine.snapshot == state(.connecting, cast(livingRoom))
      let startingChanged = machine.sessionEvent("starting", device: livingRoom, error: nil)
      let startedChanged = machine.sessionEvent("started", device: livingRoom, error: nil)
      check(
        "aConnectionStartsThenConnects",
        requested && connecting && !startingChanged && startedChanged
          && machine.snapshot == state(.connected, cast(livingRoom))
      )
    }

    do {
      let machine = connected(to: livingRoom)
      let suspended = machine.sessionEvent("suspended", device: nil, error: nil)
      let reconnecting = machine.snapshot == state(.connecting, cast(livingRoom), reconnecting: true)
      let ended = machine.sessionEvent("ended", device: nil, error: "network")
      check(
        "aSuspendedSessionReconnectsThenEndsWithItsError",
        suspended && reconnecting && ended && machine.snapshot == state(.none, nil, error: "network")
      )
    }

    do {
      let machine = connected(to: livingRoom)
      var seen: [RemoteTargetSnapshot] = []
      for (event, device) in [("ending", livingRoom), ("ended", livingRoom), ("starting", bedroom), ("started", bedroom)] {
        if machine.sessionEvent(event, device: device, error: nil) { seen.append(machine.snapshot) }
      }
      check(
        "switchingDevicesEndsTheFirstBeforeTheSecond",
        seen.map(\.phase) == [.ending, .none, .connecting, .connected]
          && seen.map(\.target) == [cast(livingRoom), nil, cast(bedroom), cast(bedroom)]
      )
    }

    do {
      let machine = RemoteTargetMachine()
      let changed = machine.sessionEvent("resumed", device: livingRoom, error: nil)
      check("aSessionResumedWithoutStartingIsConnected", changed && machine.snapshot == state(.connected, cast(livingRoom)))
    }

    do {
      let machine = RemoteTargetMachine()
      let resuming = machine.sessionEvent("resuming", device: livingRoom, error: nil)
      let reconnecting = machine.snapshot == state(.connecting, cast(livingRoom), reconnecting: true)
      let resumed = machine.sessionEvent("resumed", device: livingRoom, error: nil)
      check(
        "aResumeAtLaunchReconnectsBeforeItConnects",
        resuming && reconnecting && resumed && machine.snapshot == state(.connected, cast(livingRoom))
      )
    }

    do {
      let machine = connected(to: livingRoom)
      let requested = machine.connectRequested(bedroom)
      check("aRequestWhileConnectedChangesNothing", !requested && machine.snapshot == state(.connected, cast(livingRoom)))
    }

    do {
      let machine = RemoteTargetMachine()
      _ = machine.connectRequested(livingRoom)
      let failed = machine.sessionEvent("startFailed", device: livingRoom, error: "timeout")
      check("aFailedStartEndsWithItsError", failed && machine.snapshot == state(.none, nil, error: "timeout"))
    }

    do {
      let machine = connected(to: livingRoom)
      _ = machine.sessionEvent("ended", device: livingRoom, error: "network")
      let requested = machine.connectRequested(bedroom)
      check("aNewConnectionClearsThePreviousError", requested && machine.snapshot.error == nil)
    }

    do {
      let machine = connected(to: livingRoom)
      let changed = machine.sessionEvent("rebooted", device: bedroom, error: "odd")
      check("anUnknownEventChangesNothing", !changed && machine.snapshot == state(.connected, cast(livingRoom)))
    }

    do {
      let shape = connected(to: livingRoom).snapshot.toDictionary()
      let target = value(shape, "target") as? [String: Any?]
      let capabilities = value(target, "capabilities") as? [String: Any?]
      let none = RemoteTargetSnapshot.none.toDictionary()
      check(
        "theJsShapeNamesThePhaseAndTheTarget",
        shape.count == 4 && value(shape, "state") as? String == "connected"
          && value(target, "kind") as? String == "cast" && value(target, "id") as? String == "device-a"
          && value(target, "name") as? String == "Living room" && value(capabilities, "volume") as? Bool == true
          && value(shape, "reconnecting") as? Bool == false && shape.keys.contains("error") && value(shape, "error") == nil
          && none.count == 4 && value(none, "state") as? String == "none" && none.keys.contains("target")
          && value(none, "target") == nil
      )
    }

    if failures.isEmpty {
      print("PASS: remote target (" + String(cases) + " cases)")
    } else {
      failures.forEach { print("FAIL: " + $0) }
      exit(1)
    }
  }
}
