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

    // The Android SDK selects the asked route back; the iOS port starts it once its session has ended.
    do {
      let port = FakeTargetPort(known: [livingRoom, bedroom])
      let hub = connectedHub(port)
      _ = hub.connect(deviceId: bedroom.id)
      let accepted = hub.connect(deviceId: livingRoom.id)
      check("askingTheConnectedReceiverAgainDuringASwitchReachesThePort", accepted && port.connects == [bedroom, livingRoom])
    }

    do {
      let hub = RemoteTargetHub()
      let first = FakeTargetPort()
      hub.install(first)
      first.discover([livingRoom])
      let heard = Recording()
      let remove = hub.addListener(heard)
      hub.install(FakeTargetPort())
      remove()
      check("aReplacedPortForgetsTheOldPortsDevices", hub.devices.isEmpty && heard.deviceLists == [[]])
    }

    // What a device does on a switch (Android, status 2155 on the old session): no none in between.
    do {
      let port = FakeTargetPort(known: [livingRoom, bedroom])
      let hub = connectedHub(port)
      let listener = Recording()
      _ = hub.addListener(listener)
      let accepted = hub.connect(deviceId: bedroom.id)
      port.emit("ending", livingRoom)
      port.emit("ended", livingRoom, error: "Cast session status code 2155 (2155)")
      port.emit("starting", bedroom)
      port.emit("started", bedroom)
      check(
        "aSwitchPublishesNoNoneBetweenTheReceivers",
        accepted && listener.targets.map(\.phase) == [.ending, .connecting, .connected]
          && listener.targets.allSatisfy { $0.error == nil }
      )
    }

    do {
      let port = FakeTargetPort(known: [livingRoom, bedroom])
      let hub = connectedHub(port)
      _ = hub.connect(deviceId: bedroom.id)
      hub.disconnect(stopPlayback: true)
      port.emit("ended", livingRoom)
      check("aDisconnectDuringASwitchEndsForGoodThroughTheHub", hub.snapshot == .none)
    }

    // Focus 4 on the order nothing guarantees: the old session's end lands after the new one started.
    do {
      let port = FakeTargetPort(known: [livingRoom, bedroom])
      let hub = connectedHub(port)
      let listener = Recording()
      _ = hub.addListener(listener)
      port.emit("ending", livingRoom)
      port.emit("starting", bedroom)
      port.emit("ended", livingRoom)
      port.emit("started", bedroom)
      check(
        "aSwitchWhoseOldEndArrivesLateLandsOnTheNewDevice",
        listener.targets.map(\.phase) == [.ending, .connecting, .connected]
          && listener.targets.map(\.target) == [cast(livingRoom), cast(bedroom), cast(bedroom)]
      )
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
      hub.startDiscovery(owner: RemoteTargetHub.appDiscovery)
      let started = port.discovering
      hub.stopDiscovery(owner: RemoteTargetHub.appDiscovery)
      check("discoveryGoesToThePort", started && !port.discovering)
    }

    // The probe used to stop the discovery the header's Cast button had started, and nothing started it again.
    do {
      let hub = RemoteTargetHub()
      let port = FakeTargetPort()
      hub.install(port)
      hub.startDiscovery(owner: RemoteTargetHub.appDiscovery)
      hub.startDiscovery(owner: RemoteTargetHub.probeDiscovery)
      hub.stopDiscovery(owner: RemoteTargetHub.probeDiscovery)
      let kept = port.discovering
      hub.stopDiscovery(owner: RemoteTargetHub.appDiscovery)
      check("aStopFromOneOwnerKeepsAnotherOwnersDiscovery", kept && !port.discovering)
    }

    do {
      let hub = RemoteTargetHub()
      let port = FakeTargetPort()
      hub.install(port)
      hub.startDiscovery(owner: RemoteTargetHub.appDiscovery)
      hub.startDiscovery(owner: RemoteTargetHub.appDiscovery)
      hub.stopDiscovery(owner: RemoteTargetHub.appDiscovery)
      check("anOwnerAskingTwiceStopsOnce", !port.discovering)
    }

    do {
      let hub = RemoteTargetHub()
      hub.install(FakeTargetPort())
      hub.startDiscovery(owner: RemoteTargetHub.appDiscovery)
      let next = FakeTargetPort()
      hub.install(next)
      check("aNewPortRunsTheDiscoveryStillAsked", next.discovering)
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
    var endAccepted = true
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
        endSession: {
          sdk.ended.append($0)
          return sdk.endAccepted
        },
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

    // GCKSessionManager.startSession(with:) answers NO while a session is established: a switch ends it
    // first, and starts the other receiver once the SDK reports the end.
    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast, streamer]
      sdk.running = RunningTargetSession(device: chromecast, connected: true)
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      port.connect(streamer)
      let endedFirst = sdk.ended == [true] && sdk.started.isEmpty
      sdk.running = nil
      sdk.sessionWatches.last??("ended", chromecast, nil)
      check(
        "aSwitchEndsTheRunningSessionThenStartsTheOther",
        endedFirst && sdk.started == [streamer]
          && events.sessions == ["resumed device-a nil", "ended device-a nil"]
      )
    }

    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast, streamer]
      sdk.running = RunningTargetSession(device: chromecast, connected: true)
      sdk.sessionStarts = false
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      port.connect(streamer)
      sdk.running = nil
      sdk.sessionWatches.last??("ended", chromecast, nil)
      check(
        "aSwitchTheSdkRefusesAfterTheEndFails",
        events.sessions.last == "startFailed device-b " + GoogleCastTargetPort.startRefused
      )
    }

    // A second request while a switch waits for the old end asks the SDK nothing more: it only changes the
    // receiver that starts once that end comes (the SDK may answer NO to an end already under way).
    do {
      let sdk = Sdk()
      let kitchen = TargetDevice(id: "device-c", name: "Kitchen", model: "Chromecast")
      sdk.receivers = [chromecast, streamer, kitchen]
      sdk.running = RunningTargetSession(device: chromecast, connected: true)
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      port.connect(streamer)
      sdk.endAccepted = false
      port.connect(kitchen)
      let endedOnce = sdk.ended == [true] && !events.sessions.contains { $0.hasPrefix("startFailed") }
      sdk.running = nil
      sdk.sessionWatches.last??("ended", chromecast, nil)
      check("aSecondRequestDuringASwitchEndsTheOldSessionOnce", endedOnce && sdk.started == [kitchen])
    }

    // A disconnect the SDK refuses keeps the session, and says why instead of resolving in silence.
    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast]
      sdk.running = RunningTargetSession(device: chromecast, connected: true)
      sdk.endAccepted = false
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      port.disconnect(stopPlayback: true)
      check(
        "aDisconnectTheSdkRefusesSaysSo",
        events.sessions.last == "endRefused device-a " + GoogleCastTargetPort.disconnectRefused
      )
    }

    // endSessionAndStopCasting answering NO keeps the session: the switch cannot start, and says so,
    // and a later end of that session does not start it either.
    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast, streamer]
      sdk.running = RunningTargetSession(device: chromecast, connected: true)
      sdk.endAccepted = false
      let events = PortEventsRecording()
      let port = sdk.port()
      port.start(events: events)
      port.connect(streamer)
      let refused = events.sessions.last == "startFailed device-b " + GoogleCastTargetPort.endRefused
      sdk.running = nil
      sdk.sessionWatches.last??("ended", chromecast, nil)
      check("aSwitchWhoseEndTheSdkRefusesFails", refused && sdk.started.isEmpty)
    }

    // Asked again before its session ended for a switch: the receiver starts again once that end comes,
    // and the one the switch asked for never does.
    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast, streamer]
      sdk.running = RunningTargetSession(device: chromecast, connected: true)
      let port = sdk.port()
      port.start(events: PortEventsRecording())
      port.connect(streamer)
      port.connect(chromecast)
      let endedOnce = sdk.ended == [true]
      sdk.running = nil
      sdk.sessionWatches.last??("ended", chromecast, nil)
      check("aSwitchBackBeforeTheOldEndRestartsTheOldReceiver", endedOnce && sdk.started == [chromecast])
    }

    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast]
      sdk.running = RunningTargetSession(device: chromecast, connected: false)
      let port = sdk.port()
      port.start(events: PortEventsRecording())
      port.connect(chromecast)
      check("theReceiverAlreadyInSessionAsksNothing", sdk.ended.isEmpty && sdk.started.isEmpty)
    }

    do {
      let sdk = Sdk()
      sdk.receivers = [chromecast, streamer]
      sdk.running = RunningTargetSession(device: chromecast, connected: true)
      let port = sdk.port()
      port.start(events: PortEventsRecording())
      port.connect(streamer)
      port.disconnect(stopPlayback: true)
      sdk.running = nil
      sdk.sessionWatches.last??("ended", chromecast, nil)
      check("aDisconnectDuringASwitchDropsTheSwitch", sdk.started.isEmpty)
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

  /// Timers that run only when the test moves time on.
  final class Clock {
    private var now = 0.0
    private var tasks: [(id: Int, at: Double, run: () -> Void)] = []
    private var lastId = 0

    // Held by what it schedules for, so a test may drop the clock and keep the probe.
    var schedule: (Double, @escaping () -> Void) -> (() -> Void) {
      { delay, run in
        self.lastId += 1
        let id = self.lastId
        self.tasks.append((id, self.now + delay, run))
        return { self.tasks.removeAll { $0.id == id } }
      }
    }

    func advance(_ ms: Double) {
      now += ms
      while let index = tasks.firstIndex(where: { $0.at <= now }) {
        let task = tasks.remove(at: index)
        task.run()
      }
    }
  }

  // The debug probe on the real hub and a fake port: the same cases as CastTargetProbeTest.kt.
  static func probeCases() {
    let chromecast = TargetDevice(id: "device-a", name: "Living room", model: "Chromecast")
    let streamer = TargetDevice(id: "device-b", name: "Bedroom", model: "Google TV Streamer")
    let hold = CastTargetProbe.connectedHoldMs

    func run(
      _ name: String, keep: Bool = false, holdMs: Double = CastTargetProbe.connectedHoldMs, back: Bool = false,
      port: FakeTargetPort, before: (RemoteTargetHub) -> Void = { _ in }
    ) -> (CastTargetProbe, Clock, () -> [String]) {
      let hub = RemoteTargetHub()
      hub.install(port)
      before(hub)
      let clock = Clock()
      var logs: [String] = []
      let probe = CastTargetProbe(
        hub: hub, deviceName: name, keep: keep, holdMs: holdMs, back: back, schedule: clock.schedule
      ) { logs.append($0) }
      probe.start()
      return (probe, clock, { logs })
    }

    do {
      let port = FakeTargetPort()
      let (probe, clock, logs) = run("bed", port: port)
      let discovering = port.discovering
      port.discover([chromecast, streamer])
      clock.advance(CastTargetProbe.partialMatchSettleMs)
      port.emit("starting", streamer)
      port.emit("started", streamer)
      clock.advance(hold)
      port.emit("ending", streamer)
      port.emit("ended", streamer)
      check(
        "connectsHoldsThenDisconnectsTheNamedDevice",
        discovering && port.connects == [streamer] && port.disconnects == [true] && !probe.isActive && !port.discovering
          && logs() == [
            "armed for \"bed\" state=none target=- reconnecting=false error=-",
            "found Bedroom",
            "state=connecting target=Bedroom reconnecting=false error=-",
            "state=connected target=Bedroom reconnecting=false error=-",
            "disconnecting",
            "state=ending target=Bedroom reconnecting=false error=-",
            "state=none target=- reconnecting=false error=-",
            "done",
          ]
      )
    }

    // The iOS chain (-CastTargetProbeThen) starts the next probe from the end of the first.
    do {
      let port = FakeTargetPort()
      let hub = RemoteTargetHub()
      hub.install(port)
      var results: [String] = []
      let probe = CastTargetProbe(hub: hub, deviceName: "Living room", keep: true, schedule: Clock().schedule) { _ in }
      probe.onFinish = { results.append($0) }
      probe.start()
      port.discover([chromecast])
      port.emit("started", chromecast)
      check("aFinishedProbeSaysHowItEnded", results == ["done, still connected"] && !probe.isActive)
    }

    // On iOS the SDK resumed the session after a relaunch while a probe watched for another name.
    do {
      let port = FakeTargetPort()
      let (probe, clock, logs) = run("kitchen", port: port)
      port.emit("started", chromecast)
      clock.advance(CastTargetProbe.discoveryTimeoutMs)
      check(
        "aConnectionToAnotherReceiverIsNotTheProbes",
        port.disconnects.isEmpty && logs().last == "failed: no device named \"kitchen\"" && !probe.isActive
      )
    }

    // The bench has "Salon" and "Salon - Chromecast": a name that is a whole device name means that device.
    do {
      let castDevice = TargetDevice(id: "device-c", name: "Salon - Chromecast")
      let streamerDevice = TargetDevice(id: "device-s", name: "Salon")
      let port = FakeTargetPort()
      // The hub holds the probe weakly: the test keeps it until the check.
      let (probe, _, _) = run("salon", port: port)
      port.discover([castDevice, streamerDevice])
      check("aWholeNameWinsOverAPartOfAnother", port.connects == [streamerDevice] && probe.isActive)
    }

    // iOS lists receivers one at a time: a part of a name waits for the whole name to show up.
    do {
      let castDevice = TargetDevice(id: "device-c", name: "Salon - Chromecast")
      let streamerDevice = TargetDevice(id: "device-s", name: "Salon")
      let port = FakeTargetPort()
      let (probe, _, _) = run("salon", port: port)
      port.discover([castDevice])
      let waited = port.connects.isEmpty
      port.discover([castDevice, streamerDevice])
      check("aPartOfANameWaitsForTheWholeName", waited && port.connects == [streamerDevice] && probe.isActive)
    }

    do {
      let port = FakeTargetPort()
      let (probe, clock, _) = run("living", port: port)
      port.discover([chromecast])
      let waited = port.connects.isEmpty
      clock.advance(CastTargetProbe.partialMatchSettleMs)
      check("aPartOfANameConnectsOnceDiscoverySettles", waited && port.connects == [chromecast] && probe.isActive)
    }

    // The header's Cast button starts discovery when it mounts and never stops it: a probe's end kept it off.
    do {
      let port = FakeTargetPort()
      let hub = RemoteTargetHub()
      hub.install(port)
      hub.startDiscovery(owner: RemoteTargetHub.appDiscovery)
      let clock = Clock()
      let probe = CastTargetProbe(hub: hub, deviceName: "kitchen", keep: false, schedule: clock.schedule) { _ in }
      probe.start()
      clock.advance(CastTargetProbe.discoveryTimeoutMs)
      check("aProbeLeavesTheDiscoveryTheAppAsked", !probe.isActive && port.discovering)
    }

    // `then` asks the second receiver once the first is connected: the first session has to stay up for
    // that switch to run live, and `back` is for the probe that switches.
    do {
      let lone = CastTargetProbe.firstOfChain(keep: false, then: nil, back: true)
      let chained = CastTargetProbe.firstOfChain(keep: false, then: "Bedroom", back: true)
      let blank = CastTargetProbe.firstOfChain(keep: false, then: "", back: false)
      check("aNextReceiverKeepsTheFirstSessionUp", chained.keep && !lone.keep && !blank.keep)
      check("backBelongsToTheProbeThatSwitches", lone.back && !chained.back)
    }

    // The bench proof of a switch asked back: the receiver held when the probe started is asked again
    // before the switch has ended its session, and the probe ends connected to it.
    do {
      let port = FakeTargetPort(known: [chromecast, streamer])
      let (probe, _, logs) = run("Bedroom", keep: true, back: true, port: port) { _ in port.emit("started", chromecast) }
      port.discover([chromecast, streamer])
      port.emit("ending", chromecast)
      port.emit("ended", chromecast, error: "Cast session status code 2155 (2155)")
      port.emit("starting", chromecast)
      port.emit("started", chromecast)
      check(
        "aProbeAskedToGoBackEndsOnTheReceiverItLeft",
        port.connects == [streamer, chromecast] && !probe.isActive
          && Array(logs().dropFirst()) == [
            "found Bedroom",
            "asking Living room again",
            "state=ending target=Living room reconnecting=false error=-",
            "state=connecting target=Living room reconnecting=false error=-",
            "state=connected target=Living room reconnecting=false error=-",
            "done, still connected",
          ]
      )
    }

    // A refused switch used to publish nothing: the probe waited 30 s and said "never connected".
    do {
      let port = FakeTargetPort(known: [chromecast, streamer], refuses: [streamer.id])
      let (probe, _, logs) = run("Bedroom", port: port) { _ in port.emit("started", chromecast) }
      port.discover([chromecast, streamer])
      check(
        "aRefusedSwitchFailsTheProbeWithItsCause",
        !probe.isActive && logs().last == "failed: connection failed error=refused"
      )
    }

    // Finished inside its first request, the probe must not go on to ask the receiver it was leaving.
    do {
      let port = FakeTargetPort(known: [chromecast, streamer], refuses: [streamer.id])
      let (probe, _, _) = run("Bedroom", back: true, port: port) { _ in port.emit("started", chromecast) }
      port.discover([chromecast, streamer])
      check("aProbeThatFinishedInsideTheRequestAsksNothingMore", port.connects == [streamer] && !probe.isActive)
    }

    do {
      let port = FakeTargetPort(known: [chromecast, streamer])
      let (probe, _, logs) = run("Bedroom", back: true, port: port) { _ in port.emit("started", chromecast) }
      port.discover([streamer])
      check(
        "aBackWithTheHeldReceiverUnlistedAsksNothing",
        port.connects.isEmpty && !probe.isActive
          && logs().last == "failed: Living room is not listed, nothing to go back to"
      )
    }

    // The app switched receivers during the hold: the session is no longer the probe's to end.
    do {
      let port = FakeTargetPort(known: [chromecast, streamer])
      var hub: RemoteTargetHub?
      let (probe, clock, logs) = run("Living room", port: port) { hub = $0 }
      port.discover([chromecast, streamer])
      port.emit("started", chromecast)
      _ = hub?.connect(deviceId: streamer.id)
      port.emit("ending", chromecast)
      port.emit("ended", chromecast, error: "Cast session status code 2155 (2155)")
      port.emit("started", streamer)
      clock.advance(CastTargetProbe.connectedHoldMs)
      check(
        "theHoldLeavesASessionTheProbeDidNotOpen",
        port.disconnects.isEmpty && !probe.isActive && logs().last == "failed: the session went to Bedroom"
      )
    }

    // A part of a name whose receiver left before the settle ended must not keep a later one waiting.
    do {
      let port = FakeTargetPort()
      // The hub holds its listeners weakly: the probe has to outlive the case.
      let (probe, clock, _) = run("living", port: port)
      port.discover([chromecast])
      port.discover([])
      clock.advance(CastTargetProbe.partialMatchSettleMs)
      port.discover([chromecast])
      clock.advance(CastTargetProbe.partialMatchSettleMs)
      check("aPartialMatchThatLeftCanSettleAgain", port.connects == [chromecast] && probe.isActive)
    }

    // A port that lists its receivers inside startDiscovery: the probe connects there, and the discovery
    // timeout set after it replaced the connection's, so a slow connection failed as an unknown name.
    do {
      let port = FakeTargetPort(known: [streamer], listsOnDiscovery: true)
      let (probe, clock, logs) = run("Bedroom", port: port)
      port.emit("starting", streamer)
      clock.advance(CastTargetProbe.discoveryTimeoutMs + 1_000)
      port.emit("started", streamer)
      check(
        "aReceiverListedWhileDiscoveryStartsKeepsTheConnectionWait",
        port.connects == [streamer] && probe.isActive && !logs().contains { $0.hasPrefix("failed") }
          && logs().contains("state=connected target=Bedroom reconnecting=false error=-")
      )
    }

    do {
      let port = FakeTargetPort()
      let (probe, clock, logs) = run("kitchen", port: port)
      port.discover([chromecast])
      clock.advance(CastTargetProbe.discoveryTimeoutMs)
      check(
        "aDeviceDiscoveryNeverListsFails",
        logs().last == "failed: no device named \"kitchen\"" && port.connects.isEmpty && !probe.isActive
          && !port.discovering
      )
    }

    do {
      let port = FakeTargetPort()
      let (probe, _, logs) = run("Living room", port: port)
      port.discover([chromecast])
      port.emit("startFailed", chromecast, error: "timeout")
      check(
        "aConnectionTheSdkRefusesFailsWithItsError",
        logs().last == "failed: connection failed error=timeout" && !probe.isActive
      )
    }

    do {
      let port = FakeTargetPort()
      let (probe, clock, logs) = run("Living room", port: port)
      port.discover([chromecast])
      clock.advance(CastTargetProbe.connectTimeoutMs)
      check("aConnectionThatNeverLandsFails", logs().last == "failed: never connected" && !probe.isActive)
    }

    do {
      let port = FakeTargetPort()
      let (probe, clock, logs) = run("Living room", port: port)
      port.discover([chromecast])
      port.emit("started", chromecast)
      clock.advance(hold)
      clock.advance(CastTargetProbe.endTimeoutMs)
      check("aSessionThatNeverEndsFails", logs().last == "failed: never ended" && !probe.isActive)
    }

    do {
      let port = FakeTargetPort()
      let (probe, clock, logs) = run("Living room", keep: true, port: port)
      port.discover([chromecast])
      port.emit("started", chromecast)
      clock.advance(hold + CastTargetProbe.endTimeoutMs)
      check(
        "keepLeavesTheSessionUp",
        port.disconnects.isEmpty && logs().last == "done, still connected" && !probe.isActive
      )
    }

    // A switch: the old session ends, with no error, before the asked receiver starts.
    do {
      let port = FakeTargetPort(atStart: [("resumed", chromecast, nil)])
      let (probe, _, logs) = run("Bedroom", keep: true, port: port)
      port.discover([chromecast, streamer])
      port.emit("ending", chromecast)
      port.emit("ended", chromecast)
      port.emit("starting", streamer)
      port.emit("started", streamer)
      check(
        "aSwitchFromAnotherReceiverWaitsThroughItsEnd",
        port.connects == [streamer] && logs().last == "done, still connected"
          && !logs().contains { $0.hasPrefix("failed") } && !probe.isActive
      )
    }

    // The receiver-loss proof: the hold leaves time to cut the network, and the run logs how it ends.
    do {
      let port = FakeTargetPort()
      let (probe, clock, logs) = run("Living room", holdMs: 60_000, port: port)
      port.discover([chromecast])
      port.emit("started", chromecast)
      clock.advance(59_999)
      let held = port.disconnects.isEmpty
      port.emit("suspended", nil)
      port.emit("ended", nil, error: "network")
      check(
        "aSessionLostDuringALongHoldLogsItsEnd",
        held && !probe.isActive
          && Array(logs().suffix(3)) == [
            "state=connecting target=Living room reconnecting=true error=-",
            "state=none target=- reconnecting=false error=network",
            "done",
          ]
      )
    }

    do {
      let port = FakeTargetPort(atStart: [("resumed", chromecast, nil)])
      let (_, _, logs) = run("Living room", keep: true, port: port)
      check(
        "aSessionRunningAtArmingIsReadAsConnected",
        port.connects.isEmpty
          && logs() == [
            "armed for \"Living room\" state=connected target=Living room reconnecting=false error=-",
            "already connected to Living room",
            "done, still connected",
          ]
      )
    }

    // On the bench: connected to "Salon - Chromecast", the probe asked for "Salon" switches to the Streamer.
    do {
      let castDevice = TargetDevice(id: "device-c", name: "Salon - Chromecast")
      let streamerDevice = TargetDevice(id: "device-s", name: "Salon")
      let port = FakeTargetPort(atStart: [("resumed", castDevice, nil)])
      let (probe, _, logs) = run("Salon", keep: true, port: port)
      port.discover([castDevice, streamerDevice])
      check(
        "aPartOfTheConnectedNameStillLooksForAWholeOne",
        port.connects == [streamerDevice] && !logs().contains { $0.hasPrefix("already connected") } && probe.isActive
      )
    }

    do {
      let port = FakeTargetPort(atStart: [("resumed", chromecast, nil)])
      // The hub holds the probe weakly: the test keeps it until the check.
      let (probe, clock, logs) = run("living", keep: true, port: port)
      port.discover([chromecast])
      clock.advance(CastTargetProbe.partialMatchSettleMs)
      check(
        "aPartOfANameThatIsTheConnectedReceiverEndsAtOnce",
        port.connects.isEmpty && !probe.isActive
          && Array(logs().suffix(3)) == ["found Living room", "already connected to Living room", "done, still connected"]
      )
    }
  }

  // The fake receivers of a tier 1 build, and the choice between them and the SDK's port: the same
  // cases as FakeCastDevicesTest.kt and FakeCastDevicesWiringTest.kt. The script compiles this file
  // twice, the second time as a tier 1 build (-D FAKE_CAST_DEVICES, with --expect-fake).
  static func fakeDeviceCases() {
    let tv = FakeCastDevices.devices[0]
    let speaker = FakeCastDevices.devices[1]
    let connectDelay = RemoteTargetConstants.fakeConnectDelayMs
    let endDelay = RemoteTargetConstants.fakeEndDelayMs

    func started() -> (FakeCastDevices, Clock, PortEventsRecording) {
      let clock = Clock()
      let events = PortEventsRecording()
      let port = FakeCastDevices(schedule: clock.schedule)
      port.start(events: events)
      return (port, clock, events)
    }

    do {
      let (port, _, events) = started()
      port.startDiscovery()
      check(
        "discoveryListsTheTwoBenchDevices",
        port.devices().map(\.name) == ["Bench TV", "Bench Speaker"] && events.deviceLists == [FakeCastDevices.devices]
      )
    }

    do {
      let (port, clock, events) = started()
      port.connect(tv)
      let first = events.sessions
      clock.advance(connectDelay - 1)
      let early = events.sessions.count
      clock.advance(1)
      check(
        "aConnectionStartsThenStartedAfterItsDelay",
        first == ["starting fake-cast-living-room nil"] && early == 1
          && events.sessions == ["starting fake-cast-living-room nil", "started fake-cast-living-room nil"]
      )
    }

    do {
      let (port, clock, events) = started()
      port.connect(tv)
      clock.advance(connectDelay)
      port.disconnect(stopPlayback: true)
      clock.advance(endDelay)
      check(
        "aDisconnectEndsWithoutError",
        Array(events.sessions.dropFirst(2)) == ["ending fake-cast-living-room nil", "ended fake-cast-living-room nil"]
      )
    }

    do {
      let (port, clock, events) = started()
      port.connect(tv)
      clock.advance(connectDelay)
      port.connect(speaker)
      clock.advance(connectDelay)
      check(
        "anotherDeviceEndsTheFirstBeforeItStarts",
        Array(events.sessions.dropFirst(2)) == [
          "ending fake-cast-living-room nil", "ended fake-cast-living-room nil",
          "starting fake-cast-bedroom nil", "started fake-cast-bedroom nil",
        ]
      )
    }

    do {
      let (port, clock, events) = started()
      port.connect(tv)
      port.disconnect(stopPlayback: true)
      clock.advance(connectDelay + endDelay)
      check(
        "aDisconnectWhileConnectingNeverStarts",
        events.sessions == [
          "starting fake-cast-living-room nil", "ending fake-cast-living-room nil", "ended fake-cast-living-room nil",
        ]
      )
    }

    do {
      let (port, _, events) = started()
      port.disconnect(stopPlayback: false)
      check("aDisconnectWithNothingConnectedEnds", events.sessions == ["ended nil nil"])
    }

    do {
      let (port, _, events) = started()
      port.connect(livingRoom)
      check(
        "aDeviceOffTheBenchFailsToStart",
        events.sessions == ["startFailed device-a " + FakeCastDevices.notOnTheBench]
      )
    }

    do {
      let (port, clock, events) = started()
      port.connect(tv)
      port.stop()
      clock.advance(connectDelay)
      check("aStoppedPortSendsNothingMore", events.sessions == ["starting fake-cast-living-room nil"])
    }

    do {
      let clock = Clock()
      let hub = RemoteTargetHub()
      hub.install(FakeCastDevices(schedule: clock.schedule))
      hub.startDiscovery(owner: RemoteTargetHub.appDiscovery)
      let accepted = hub.connect(deviceId: "fake-cast-living-room")
      let connecting = hub.snapshot.phase
      clock.advance(connectDelay)
      check(
        "theHubConnectsToAFakeReceiverById",
        accepted && connecting == .connecting && hub.snapshot == state(.connected, .cast(tv))
          && hub.devices == FakeCastDevices.devices
      )
    }

    do {
      let expectFake = CommandLine.arguments.contains("--expect-fake")
      let real = FakeTargetPort()
      let schedule = Clock().schedule
      check("theBuildHasFakeDevicesOnlyWhenItAskedForThem", RemoteTargets.fakeDevices == expectFake)
      var warnings: [String] = []
      let realPort = RemoteTargets.portFor(fake: false, real: { real }, schedule: schedule) { warnings.append($0) }
      let quiet = warnings.isEmpty
      let fakePort = RemoteTargets.portFor(fake: true, real: { real }, schedule: schedule) { warnings.append($0) }
      // A build that should not have them shows it in the device log.
      check(
        "theRealPortUnlessTheBuildAskedForFakes",
        realPort === real && quiet && fakePort is FakeCastDevices && warnings == [RemoteTargets.fakeReceiversWarning]
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

    // Nothing promises the old session's end comes before the new one starts: a late end is the old session's.
    do {
      let machine = connected(to: livingRoom)
      _ = machine.sessionEvent("ending", device: livingRoom, error: nil)
      _ = machine.sessionEvent("starting", device: bedroom, error: nil)
      let lateEnd = machine.sessionEvent("ended", device: livingRoom, error: nil)
      let stillConnecting = machine.snapshot == state(.connecting, cast(bedroom))
      let started = machine.sessionEvent("started", device: bedroom, error: nil)
      check(
        "anEndNamingAnotherDeviceLeavesTheNewOneAlone",
        !lateEnd && stillConnecting && started && machine.snapshot == state(.connected, cast(bedroom))
      )
    }

    do {
      let machine = connected(to: livingRoom)
      let refused = machine.sessionEvent("startFailed", device: bedroom, error: "refused")
      let ending = machine.sessionEvent("ending", device: bedroom, error: nil)
      check(
        "aRefusedStartOfAnotherDeviceLeavesTheConnectedOne",
        !refused && !ending && machine.snapshot == state(.connected, cast(livingRoom))
      )
    }

    do {
      let machine = connected(to: livingRoom)
      let ended = machine.sessionEvent("ended", device: nil, error: "network")
      check("anEndWithoutADeviceStillEnds", ended && machine.snapshot == state(.none, nil, error: "network"))
    }

    // On a device the Android SDK ends the old session with status 2155 when a switch selects another route.
    do {
      let machine = connected(to: livingRoom)
      let requested = machine.connectRequested(bedroom)
      var seen: [RemoteTargetSnapshot] = []
      let events: [(String, TargetDevice, String?)] = [
        ("ending", livingRoom, nil), ("ended", livingRoom, "Cast session status code 2155 (2155)"),
        ("starting", bedroom, nil), ("started", bedroom, nil),
      ]
      for (event, device, error) in events where machine.sessionEvent(event, device: device, error: error) {
        seen.append(machine.snapshot)
      }
      check(
        "aSwitchGoesFromTheOldReceiverToTheNewOneWithoutAnError",
        !requested
          && seen == [state(.ending, cast(livingRoom)), state(.connecting, cast(bedroom)), state(.connected, cast(bedroom))]
      )
    }

    do {
      let machine = connected(to: livingRoom)
      _ = machine.connectRequested(bedroom)
      // A switch the port refuses at once (a disabled route, an end the SDK keeps) leaves the receiver
      // that holds the session, with the cause: silence there left the sheet, and the probe, waiting.
      let refused = machine.sessionEvent("startFailed", device: bedroom, error: "busy")
      let kept = machine.snapshot == state(.connected, cast(livingRoom), error: "busy")
      let ended = machine.sessionEvent("ended", device: livingRoom, error: nil)
      check(
        "aSwitchRefusedBeforeTheOldEndKeepsTheOldReceiverAndSaysWhy",
        refused && kept && ended && machine.snapshot == .none
      )
    }

    // The only start in flight during a switch is the asked receiver's: a start failure without its device
    // is that one's, and ends the switch instead of leaving it connecting.
    do {
      let machine = connected(to: livingRoom)
      _ = machine.connectRequested(bedroom)
      _ = machine.sessionEvent("ended", device: livingRoom, error: "Cast session status code 2155 (2155)")
      let changed = machine.sessionEvent("startFailed", device: nil, error: "gone")
      check("aDeviceLessStartFailureDuringASwitchEndsWithItsError", changed && machine.snapshot == state(.none, nil, error: "gone"))
    }

    do {
      let machine = connected(to: livingRoom)
      machine.disconnectRequested()
      let changed = machine.sessionEvent("endRefused", device: livingRoom, error: "kept")
      check(
        "aRefusedEndKeepsTheReceiverAndSaysWhy",
        changed && machine.snapshot == state(.connected, cast(livingRoom), error: "kept")
      )
    }

    do {
      let machine = connected(to: livingRoom)
      _ = machine.connectRequested(bedroom)
      _ = machine.sessionEvent("ended", device: livingRoom, error: nil)
      let failed = machine.sessionEvent("startFailed", device: bedroom, error: "timeout")
      check(
        "aNewReceiverFailingAfterTheSwitchEndsWithItsError",
        failed && machine.snapshot == state(.none, nil, error: "timeout")
      )
    }

    do {
      let machine = connected(to: livingRoom)
      _ = machine.connectRequested(bedroom)
      machine.disconnectRequested()
      _ = machine.sessionEvent("ended", device: livingRoom, error: nil)
      check("aDisconnectDuringASwitchEndsForGood", machine.snapshot == .none)
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

    // A late end of the receiver a switch left must not end the one that took over and is ending now.
    do {
      let machine = connected(to: livingRoom)
      _ = machine.connectRequested(bedroom)
      _ = machine.sessionEvent("ending", device: livingRoom, error: nil)
      _ = machine.sessionEvent("starting", device: bedroom, error: nil)
      _ = machine.sessionEvent("started", device: bedroom, error: nil)
      _ = machine.sessionEvent("ending", device: bedroom, error: nil)
      let changed = machine.sessionEvent("ended", device: livingRoom, error: "Cast session status code 2155 (2155)")
      check("aLateEndOfTheOldReceiverLeavesTheNewOneEnding", !changed && machine.snapshot == state(.ending, cast(bedroom)))
    }

    // Asked again while a switch takes its session away: the end of that session leads back to it.
    do {
      let machine = connected(to: livingRoom)
      _ = machine.connectRequested(bedroom)
      let requested = machine.connectRequested(livingRoom)
      _ = machine.sessionEvent("ending", device: livingRoom, error: nil)
      _ = machine.sessionEvent("ended", device: livingRoom, error: "Cast session status code 2155 (2155)")
      let back = machine.snapshot == state(.connecting, cast(livingRoom))
      _ = machine.sessionEvent("starting", device: livingRoom, error: nil)
      _ = machine.sessionEvent("started", device: livingRoom, error: nil)
      check(
        "askingTheHeldReceiverAgainDuringASwitchLeadsBackToIt",
        !requested && back && machine.snapshot == state(.connected, cast(livingRoom))
      )
    }

    do {
      let machine = connected(to: livingRoom)
      _ = machine.connectRequested(bedroom)
      _ = machine.connectRequested(livingRoom)
      _ = machine.sessionEvent("ended", device: livingRoom, error: "Cast session status code 2155 (2155)")
      let changed = machine.sessionEvent("startFailed", device: livingRoom, error: "busy")
      check(
        "theHeldReceiverAskedBackThenFailingEndsWithItsError",
        changed && machine.snapshot == state(.none, nil, error: "busy")
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
    probeCases()
    fakeDeviceCases()

    if failures.isEmpty {
      print("PASS: remote target (" + String(cases) + " cases)")
    } else {
      failures.forEach { print("FAIL: " + $0) }
      exit(1)
    }
  }
}
