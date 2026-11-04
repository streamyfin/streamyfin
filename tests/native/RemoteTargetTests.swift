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

  final class Recording: RemoteTargetListener {
    var targets: [RemoteTargetSnapshot] = []
    var deviceLists: [[TargetDevice]] = []
    var onTarget: (RemoteTargetSnapshot) -> Void = { _ in }

    func remoteTargetDidChange(_ snapshot: RemoteTargetSnapshot) {
      targets.append(snapshot)
      onTarget(snapshot)
    }

    func remoteTargetDevicesDidChange(_ devices: [TargetDevice]) { deviceLists.append(devices) }
  }

  static func connectedHub(_ port: FakeTargetPort) -> RemoteTargetHub {
    let hub = RemoteTargetHub()
    hub.install(port)
    port.emit("started", livingRoom)
    return hub
  }

  // The hub holds the target for the whole process and talks to the SDK through a port: the same
  // cases as RemoteTargetHubTest.kt.
  static func hubCases() {
    do {
      let hub = RemoteTargetHub()
      hub.install(FakeTargetPort(atStart: [("resumed", livingRoom, nil)]))
      check(
        "aSessionAlreadyRunningAtInstallIsConnected",
        hub.snapshot.phase == .connected && hub.snapshot.target == cast(livingRoom)
      )
    }

    do {
      let hub = RemoteTargetHub()
      let port = FakeTargetPort(known: [livingRoom])
      hub.install(port)
      let listener = Recording()
      _ = hub.addListener(listener)
      let accepted = hub.connect(deviceId: "missing")
      check(
        "anUnknownDeviceIsRefusedWithoutAStateChange",
        !accepted && port.connects.isEmpty && listener.targets.isEmpty && hub.snapshot == .none
      )
    }

    do {
      let hub = RemoteTargetHub()
      let port = FakeTargetPort(known: [livingRoom, bedroom])
      hub.install(port)
      let listener = Recording()
      var askedBeforeTheAnnounce: [Int] = []
      listener.onTarget = { _ in askedBeforeTheAnnounce.append(port.connects.count) }
      _ = hub.addListener(listener)
      let accepted = hub.connect(deviceId: bedroom.id)
      check(
        "connectingAKnownDeviceAnnouncesItThenAsksThePort",
        accepted && listener.targets == [state(.connecting, cast(bedroom))] && askedBeforeTheAnnounce == [0]
          && port.connects == [bedroom]
      )
    }

    do {
      let port = FakeTargetPort(known: [livingRoom, bedroom])
      let hub = connectedHub(port)
      let accepted = hub.connect(deviceId: bedroom.id)
      check(
        "anotherDeviceWhileConnectedGoesToThePortAndTheSdkEventsFollow",
        accepted && port.connects == [bedroom] && hub.snapshot.target == cast(livingRoom)
      )
    }

    do {
      let port = FakeTargetPort(known: [livingRoom])
      let hub = connectedHub(port)
      let accepted = hub.connect(deviceId: livingRoom.id)
      check("theDeviceAlreadyConnectedAsksNothing", accepted && port.connects.isEmpty)
    }

    do {
      let hub = RemoteTargetHub()
      let port = FakeTargetPort()
      hub.install(port)
      let listener = Recording()
      _ = hub.addListener(listener)
      port.emit("starting", livingRoom)
      port.emit("starting", livingRoom)
      check("onlyChangesReachTheListeners", listener.targets.count == 1)
    }

    do {
      let hub = RemoteTargetHub()
      let port = FakeTargetPort()
      hub.install(port)
      let listener = Recording()
      _ = hub.addListener(listener)
      port.discover([livingRoom, bedroom])
      port.discover([livingRoom, bedroom])
      check(
        "devicesFollowThePort",
        hub.devices == [livingRoom, bedroom] && listener.deviceLists == [[livingRoom, bedroom]]
      )
    }

    do {
      let hub = RemoteTargetHub()
      hub.install(FakeTargetPort(known: [livingRoom]))
      check("noDeviceIsListedBeforeDiscovery", hub.devices.isEmpty)
    }

    do {
      let port = FakeTargetPort(known: [livingRoom])
      let hub = connectedHub(port)
      hub.disconnect(stopPlayback: true)
      check(
        "disconnectGoesToThePortAndWaitsForItsEvents",
        port.disconnects == [true] && hub.snapshot.phase == .connected
      )
    }

    do {
      let hub = RemoteTargetHub()
      let port = FakeTargetPort()
      hub.install(port)
      hub.startDiscovery()
      let started = port.discovering
      hub.stopDiscovery()
      check("discoveryGoesToThePort", started && !port.discovering)
    }

    do {
      let hub = RemoteTargetHub()
      let port = FakeTargetPort()
      hub.install(port)
      let listener = Recording()
      let remove = hub.addListener(listener)
      remove()
      port.emit("started", livingRoom)
      check("aRemovedListenerHearsNothing", listener.targets.isEmpty)
    }

    do {
      let hub = RemoteTargetHub()
      let port = FakeTargetPort()
      hub.install(port)
      hub.install(port)
      check("theSamePortInstalledTwiceStartsOnce", port.starts == 1)
    }

    do {
      let first = FakeTargetPort(atStart: [("started", livingRoom, nil)])
      let second = FakeTargetPort()
      let hub = RemoteTargetHub()
      hub.install(first)
      let listener = Recording()
      _ = hub.addListener(listener)
      let stale = first.events
      hub.install(second)
      stale?.sessionEvent("started", device: bedroom, error: nil)
      check(
        "aNewPortReplacesTheOldOneAndItsTarget",
        first.stopped && second.starts == 1 && hub.snapshot == .none && listener.targets == [.none]
      )
    }

    // iOS only: the hub holds its listeners weakly, like the receiver hub.
    do {
      let hub = RemoteTargetHub()
      let port = FakeTargetPort()
      hub.install(port)
      weak var released: Recording?
      do {
        let listener = Recording()
        released = listener
        _ = hub.addListener(listener)
      }
      port.emit("started", livingRoom)
      check("aReleasedListenerIsLetGo", released == nil && hub.snapshot.phase == .connected)
    }
  }

  final class PortEventsRecording: TargetPortEvents {
    var sessions: [String] = []
    var deviceLists: [[TargetDevice]] = []

    func sessionEvent(_ event: String, device: TargetDevice?, error: String?) {
      sessions.append(event + " " + (device?.id ?? "nil") + " " + (error ?? "nil"))
    }

    func devicesChanged(_ devices: [TargetDevice]) { deviceLists.append(devices) }
  }

  /// Stands in for the discovery and session managers behind GoogleCastTargetPort.
  final class Sdk {
    var receivers: [TargetDevice] = []
    var running: RunningTargetSession?
    var sessionStarts = true
    var started: [TargetDevice] = []
    var ended: [Bool] = []
    var sessionWatches: [((String, TargetDevice?, String?) -> Void)?] = []
    var deviceWatches: [(() -> Void)?] = []
    var discovery: [Bool] = []

    // The port holds the fake, not the other way round: a test may drop the fake and keep the port.
    func port() -> GoogleCastTargetPort {
      let sdk = self
      return GoogleCastTargetPort(
        routes: {
          sdk.receivers.map { device in
            CastTargetRoute(device: device) {
              sdk.started.append(device)
              return sdk.sessionStarts
            }
          }
        },
        runningSession: { sdk.running },
        endSession: { sdk.ended.append($0) },
        watchSessions: { sdk.sessionWatches.append($0) },
        watchDevices: { sdk.deviceWatches.append($0) },
        discovery: { sdk.discovery.append($0) }
      )
    }
  }

  // The SDK half of the hub's port, with the SDK calls as closures: the same cases as
  // GoogleCastTargetPortTest.kt, plus the two the iOS SDK adds (the device list it keeps, and a
  // session it refuses to start).
  static func portCases() {
    let chromecast = TargetDevice(id: "device-a", name: "Living room", model: "Chromecast")
    let streamer = TargetDevice(id: "device-b", name: "Bedroom", model: "Google TV Streamer")

    check(
      "aDeviceKeepsTheRecordDiscoveryPublishes",
      value(chromecast.toDictionary(), "deviceId") as? String == "device-a"
        && value(chromecast.toDictionary(), "friendlyName") as? String == "Living room"
        && value(chromecast.toDictionary(), "modelName") as? String == "Chromecast"
        && livingRoom.toDictionary().keys.contains("modelName") && value(livingRoom.toDictionary(), "modelName") == nil
    )

    do {
      let sdk = Sdk()
      sdk.running = RunningTargetSession(device: chromecast, connected: true)
      let events = PortEventsRecording()
      sdk.port().start(events: events)
      check("aSessionRunningAtStartIsReportedAsResumed", events.sessions == ["resumed device-a nil"])
    }

    do {
      let sdk = Sdk()
      sdk.running = RunningTargetSession(device: chromecast, connected: false)
      let events = PortEventsRecording()
      sdk.port().start(events: events)
      check("aSessionStillConnectingAtStartIsReportedAsResuming", events.sessions == ["resuming device-a nil"])
    }

    do {
      let events = PortEventsRecording()
      Sdk().port().start(events: events)
      check("noSessionAtStartReportsNothing", events.sessions.isEmpty)
    }

    do {
      let sdk = Sdk()
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      sdk.sessionWatches.last??("ending", chromecast, nil)
      check("theSdkSessionCallbacksReachTheHub", sdk.sessionWatches.count == 1 && events.sessions == ["ending device-a nil"])
    }

    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast, streamer]
      let port = sdk.port()
      port.start(events: PortEventsRecording())
      port.connect(streamer)
      check("connectSelectsTheRouteOfThatDevice", sdk.started == [streamer])
    }

    do {
      let sdk = Sdk()
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      port.connect(chromecast)
      check(
        "aDeviceNoLongerRoutedEndsInStartFailed",
        sdk.started.isEmpty && events.sessions == ["startFailed device-a " + GoogleCastTargetPort.receiverGone]
      )
    }

    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast]
      sdk.sessionStarts = false
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      port.connect(chromecast)
      check(
        "aSessionTheSdkWillNotStartEndsInStartFailed",
        sdk.started == [chromecast] && events.sessions == ["startFailed device-a " + GoogleCastTargetPort.startRefused]
      )
    }

    do {
      let sdk = Sdk()
      sdk.running = RunningTargetSession(device: chromecast, connected: true)
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      port.disconnect(stopPlayback: true)
      check("disconnectEndsTheRunningSession", sdk.ended == [true] && events.sessions == ["resumed device-a nil"])
    }

    do {
      let sdk = Sdk()
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      port.disconnect(stopPlayback: false)
      check("disconnectBeforeASessionStartedEndsTheRequest", sdk.ended.isEmpty && events.sessions == ["ended nil nil"])
    }

    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast]
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      port.startDiscovery()
      port.startDiscovery()
      sdk.receivers = [chromecast, streamer]
      sdk.deviceWatches.last??()
      check(
        "discoveryListsTheRoutesAndFollowsThem",
        sdk.discovery == [true] && events.deviceLists == [[chromecast], [chromecast, streamer]]
          && port.devices() == [chromecast, streamer]
      )
    }

    // The module listed what the SDK had found as soon as it listened, before any discovery call.
    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast]
      let events = PortEventsRecording()
      sdk.port().start(events: events)
      check("theDeviceListIsReportedAtStart", events.deviceLists == [[chromecast]] && sdk.deviceWatches.count == 1)
    }

    do {
      let sdk = Sdk()
      let port = sdk.port()
      port.start(events: PortEventsRecording())
      port.startDiscovery()
      port.stop()
      check(
        "stopLetsGoOfTheSdk",
        sdk.sessionWatches.last.map { $0 == nil } == true && sdk.deviceWatches.last.map { $0 == nil } == true
          && sdk.discovery == [true, false]
      )
    }
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

    hubCases()
    portCases()

    if failures.isEmpty {
      print("PASS: remote target (" + String(cases) + " cases)")
    } else {
      failures.forEach { print("FAIL: " + $0) }
      exit(1)
    }
  }
}
