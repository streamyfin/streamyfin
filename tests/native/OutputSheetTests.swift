import Foundation

// What the output sheet draws, from the target state and from the screen that opened it, and what its
// controller asks the hub. The same cases as OutputSheetModelTest.kt and OutputSheetControllerTest.kt.
@main
enum OutputSheetTests {
  static var failures: [String] = []
  static var cases = 0
  static let livingRoom = TargetDevice(id: "device-a", name: "Living room", model: "Chromecast")
  static let bedroom = TargetDevice(id: "device-b", name: "bedroom", model: "Google TV Streamer")
  static let attic = TargetDevice(id: "device-c", name: "Attic speaker", model: "Google Home", videoOut: false)

  static func check(_ name: String, _ ok: Bool) {
    cases += 1
    if !ok { failures.append(name) }
  }

  final class Clock {
    private var now = 0.0
    private var tasks: [(id: Int, at: Double, run: () -> Void)] = []
    private var lastId = 0
    var pending: Int { tasks.count }

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

  static func input(
    snapshot: RemoteTargetSnapshot = .none, devices: [TargetDevice] = [livingRoom, bedroom, attic],
    playServices: PlayServicesStatus = .available, airPlay: AirPlayInput? = nil, playingHere: String? = nil
  ) -> OutputSheetInput {
    OutputSheetInput(
      snapshot: snapshot, devices: devices, discovering: true, searchTimedOut: false, playServices: playServices,
      airPlay: airPlay, thisDevice: .phone, playingHere: playingHere, receiverTitle: nil, showingList: false,
      draggedVolume: nil, requestedId: nil
    )
  }

  static func rows(_ state: OutputSheetState) -> [OutputRow] {
    if case let .list(rows) = state { return rows }
    return []
  }

  static func panel(_ state: OutputSheetState) -> ConnectedPanel? {
    if case let .connected(panel) = state { return panel }
    return nil
  }

  static func status(_ state: OutputSheetState, _ device: TargetDevice) -> DeviceStatus? {
    for row in rows(state) {
      if case let .device(id, _, _, status) = row, id == device.id { return status }
    }
    return nil
  }

  static func main() {
    modelCases()
    controllerCases()

    if failures.isEmpty {
      print("PASS: output sheet (" + String(cases) + " cases)")
    } else {
      failures.forEach { print("FAIL: " + $0) }
      exit(1)
    }
  }

  static func modelCases() {
    // A local order that ignores case: "bedroom" sorts between "Attic speaker" and "Living room".
    do {
      let rows = rows(outputSheetState(input(airPlay: AirPlayInput(activeRoute: nil), playingHere: "Big Buck Bunny")))
      check(
        "theListPutsThisDeviceFirstThenTheDevicesByName",
        rows == [
          .thisDevice(kind: .phone, playing: "Big Buck Bunny"),
          .device(id: "device-c", name: "Attic speaker", videoOut: false, status: .idle),
          .device(id: "device-b", name: "bedroom", videoOut: true, status: .idle),
          .device(id: "device-a", name: "Living room", videoOut: true, status: .idle),
          .airPlay(activeRoute: nil),
        ]
      )
    }

    // Discovery can drop the receiver a session is on: its row stays, with its status.
    do {
      let connecting = RemoteTargetSnapshot(
        phase: .connecting, target: .cast(livingRoom), reconnecting: false, error: nil
      )
      let rows = rows(outputSheetState(input(snapshot: connecting, devices: [bedroom])))
      check(
        "aTargetMissingFromDiscoveryKeepsItsRow",
        rows == [
          .thisDevice(kind: .phone, playing: nil),
          .device(id: "device-b", name: "bedroom", videoOut: true, status: .idle),
          .device(id: "device-a", name: "Living room", videoOut: true, status: .connecting),
        ]
      )
    }

    // A speaker draws as one: the panel takes the receiver's screen from discovery's record of it, and a
    // receiver discovery dropped draws as a TV.
    do {
      func connected(to device: TargetDevice) -> RemoteTargetSnapshot {
        RemoteTargetSnapshot(phase: .connected, target: .cast(device), reconnecting: false, error: nil, volume: 0.5)
      }
      let speaker = panel(outputSheetState(input(snapshot: connected(to: attic))))?.videoOut
      let tv = panel(outputSheetState(input(snapshot: connected(to: livingRoom))))?.videoOut
      let unlisted = panel(outputSheetState(input(snapshot: connected(to: attic), devices: [livingRoom])))?.videoOut
      check("thePanelKnowsASpeakerByItsRecord", speaker == false && tv == true && unlisted == true)
    }

    // iOS mutes the receiver itself, which takes nothing playing; Android mutes the stream and waits for one.
    do {
      let connected = RemoteTargetSnapshot(
        phase: .connected, target: .cast(livingRoom), reconnecting: false, error: nil, volume: 0.5
      )
      check("theDeviceMuteNeedsNothingPlaying", panel(outputSheetState(input(snapshot: connected)))?.canMute == true)
    }

    do {
      let missing = rows(outputSheetState(input(devices: [], playServices: .missing)))
      let outdated = rows(outputSheetState(input(devices: [], playServices: .updateRequired)))
      check(
        "missingPlayServicesSaySoInsteadOfSearching",
        missing.last == .status(.playServicesMissing) && outdated.last == .status(.playServicesUpdate) && missing.count == 2
      )
    }

    // The port's own refusals by their message, the SDK's by GCKErrorCode; anything else keeps its message.
    do {
      let network = [1, 2, 14, 17, 92].allSatisfy { (code: Int) in
        failureCause(error: "Cast error \(code)", code: code) == .network
      }
      let receiver = [20, 21, 104, 105, 106, 107].allSatisfy { (code: Int) in
        failureCause(error: "Cast error \(code)", code: code) == .receiverUnavailable
      }
      check(
        "failureCausesMapToTheirFamilies",
        failureCause(error: GoogleCastTargetPort.receiverGone, code: nil) == .deviceGone
          && failureCause(error: FakeCastDevices.notOnTheBench, code: nil) == .deviceGone
          && failureCause(error: GoogleCastTargetPort.startRefused, code: nil) == .receiverUnavailable
          && failureCause(error: GoogleCastTargetPort.endRefused, code: nil) == .receiverUnavailable
          && failureCause(error: GoogleCastTargetPort.disconnectRefused, code: nil)
            == .other(GoogleCastTargetPort.disconnectRefused)
          && network && receiver
          && failureCause(error: "Cast error 30", code: 30) == .other("Cast error 30")
      )
    }

    check("theLayoutIsAPopoverFrom600dp", outputLayout(widthDp: 599) == .sheet && outputLayout(widthDp: 600) == .popover)
  }

  static func controllerCases() {
    let livingRoom = TargetDevice(id: "device-a", name: "Living room")
    let bedroom = TargetDevice(id: "device-b", name: "Bedroom")

    func sheet(
      _ port: FakeTargetPort, clock: Clock, receiverTitle: String? = "Big Buck Bunny", receiverPlaying: Bool? = nil,
      outputs: @escaping (OutputSheetOutput) -> Void = { _ in }
    ) -> OutputSheetController {
      let hub = RemoteTargetHub()
      hub.install(port)
      let sheet = OutputSheetController(hub: hub, schedule: clock.schedule)
      sheet.environment = OutputSheetEnvironment(
        receiverTitle: receiverTitle, receiverPlaying: receiverPlaying ?? (receiverTitle != nil)
      )
      sheet.onOutput = outputs
      sheet.open()
      return sheet
    }

    func port() -> FakeTargetPort { FakeTargetPort(known: [livingRoom, bedroom], listsOnDiscovery: true) }

    func deviceRow(_ sheet: OutputSheetController, _ device: TargetDevice) -> OutputRow {
      rows(sheet.state).first { if case let .device(id, _, _, _) = $0 { return id == device.id } else { return false } }
        ?? .status(.searching)
    }

    do {
      let port = port()
      let sheet = sheet(port, clock: Clock())
      sheet.tap(deviceRow(sheet, bedroom))
      let connecting = status(sheet.state, bedroom)
      sheet.cancel()
      check(
        "aConnectingTargetShowsItsIndicatorAndCancel",
        port.connects == [bedroom] && connecting == .connecting && port.disconnects == [true]
      )
    }

    do {
      let port = port()
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      let connectedTo = panel(sheet.state)?.target.id
      sheet.change()
      let listed = status(sheet.state, livingRoom)
      sheet.tap(deviceRow(sheet, bedroom))
      // The hub ends the first session before the second starts: the sheet only asks for the receiver.
      check(
        "aConnectedTargetShowsThePanelAndChangeShowsTheList",
        connectedTo == "device-a" && listed == .connected && port.connects == [bedroom]
          && status(sheet.state, bedroom) == .connecting
      )
    }

    do {
      let port = port()
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      port.events?.sessionEvent("ended", device: livingRoom, error: "Cast error 1", code: 1)
      check("aLostTargetShowsItsCauseOnItsRow", status(sheet.state, livingRoom) == .failed(.network))
      sheet.tap(deviceRow(sheet, livingRoom))
      check(
        "aRetryClearsTheError", status(sheet.state, livingRoom) == .connecting && port.connects == [livingRoom]
      )
    }

    do {
      let port = FakeTargetPort(listsOnDiscovery: true)
      let clock = Clock()
      let sheet = sheet(port, clock: clock)
      let searching = rows(sheet.state).last
      clock.advance(RemoteTargetConstants.outputSearchTimeoutMs)
      let nothing = rows(sheet.state).last
      port.discover([bedroom])
      let devices = rows(sheet.state).filter { if case .device = $0 { return true } else { return false } }
      let statuses = rows(sheet.state).filter { if case .status = $0 { return true } else { return false } }
      check(
        "noDeviceAfterTheTimeoutSaysSo",
        searching == .status(.searching) && nothing == .status(.noDevices) && devices.count == 1 && statuses.isEmpty
      )
    }

    do {
      let port = port()
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      port.events?.volumeChanged(level: 0.3, muted: false)
      let fromTheTv = panel(sheet.state)?.volume
      sheet.dragVolume(0.7)
      port.events?.volumeChanged(level: 0.5, muted: false)
      check(
        "aVolumeFromTheTvMovesTheSliderUnlessItIsDragged",
        fromTheTv == 0.3 && panel(sheet.state)?.volume == 0.7 && port.volumes.isEmpty
      )
    }

    do {
      let port = port()
      let clock = Clock()
      let sheet = sheet(port, clock: clock)
      port.emit("started", livingRoom)
      port.events?.volumeChanged(level: 0.3, muted: false)
      sheet.releaseVolume(0.62)
      port.events?.volumeChanged(level: 0.3, muted: false)
      let beforeTheEcho = panel(sheet.state)?.volume
      port.events?.volumeChanged(level: 0.6, muted: false)
      let echoed = panel(sheet.state)?.volume
      sheet.releaseVolume(0.9)
      clock.advance(RemoteTargetConstants.volumeSettleMs)
      // No echo within the settle time: the slider goes back to what the receiver says.
      check(
        "aReleasedSliderHoldsItsValueUntilTheReceiverEchoesIt",
        port.volumes == [0.62, 0.9] && beforeTheEcho == 0.62 && echoed == 0.6 && panel(sheet.state)?.volume == 0.6
      )
    }

    // The system can take a touch back without the slider hearing its end (a slow drag in the iOS sheet,
    // 04/11): a slider left still that long is sent as if released.
    do {
      let port = port()
      let clock = Clock()
      let sheet = sheet(port, clock: clock)
      port.emit("started", livingRoom)
      port.events?.volumeChanged(level: 0.3, muted: false)
      sheet.dragVolume(0.4)
      sheet.dragVolume(0.45)
      clock.advance(RemoteTargetConstants.volumeDragRestMs - 1)
      let beforeTheRest = port.volumes
      clock.advance(1)
      check("aSliderLeftStillIsSentAsReleased", beforeTheRest.isEmpty && port.volumes == [0.45])
    }

    do {
      let port = port()
      let clock = Clock()
      let sheet = sheet(port, clock: clock)
      port.emit("started", livingRoom)
      port.events?.volumeChanged(level: 0.3, muted: false)
      sheet.dragVolume(0.4)
      sheet.releaseVolume(0.4)
      clock.advance(RemoteTargetConstants.volumeDragRestMs)
      check("aReleasedSliderIsSentOnce", port.volumes == [0.4])
    }

    // The view still holds its drag when the rest sends it: the release it sends after asks nothing more.
    do {
      let port = port()
      let clock = Clock()
      let sheet = sheet(port, clock: clock)
      port.emit("started", livingRoom)
      port.events?.volumeChanged(level: 0.3, muted: false)
      sheet.dragVolume(0.45)
      clock.advance(RemoteTargetConstants.volumeDragRestMs)
      sheet.releaseVolume(0.45)
      check("aSliderReleasedAfterItsRestIsSentOnce", port.volumes == [0.45])
    }

    // A port can refuse inside connect, as a disabled route does: the asked row shows the failure, not a wait.
    do {
      let port = FakeTargetPort(known: [livingRoom, bedroom], listsOnDiscovery: true, refuses: [bedroom.id])
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      sheet.change()
      sheet.tap(deviceRow(sheet, bedroom))
      var failed = false
      if case .failed = status(sheet.state, bedroom) { failed = true }
      check("aSwitchRefusedAtOnceShowsItsFailure", failed)
    }

    // The receiver's media can come without a title: it still plays, so the stop and the remote stay.
    do {
      let port = port()
      let sheet = sheet(port, clock: Clock(), receiverTitle: nil, receiverPlaying: true)
      port.emit("started", livingRoom)
      check(
        "aReceiverPlayingWithoutATitleCanStillBeStopped",
        panel(sheet.state)?.canStop == true && panel(sheet.state)?.receiverTitle == nil
      )
    }

    // Back to the receiver a switch was leaving: the asked one goes back to idle.
    do {
      let port = port()
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      sheet.change()
      sheet.tap(deviceRow(sheet, bedroom))
      let asked = status(sheet.state, bedroom)
      sheet.tap(deviceRow(sheet, livingRoom))
      sheet.change()
      check(
        "goingBackDuringASwitchForgetsTheAskedReceiver", asked == .connecting && status(sheet.state, bedroom) == .idle
      )
    }

    // Discovery can lose the receiver a switch leaves: going back to it is refused, and the switch goes on.
    do {
      let port = port()
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      sheet.change()
      sheet.tap(deviceRow(sheet, bedroom))
      port.discover([bedroom])
      sheet.tap(deviceRow(sheet, livingRoom))
      check("aSwitchGoesOnWhenTheReceiverItLeavesIsLost", status(sheet.state, bedroom) == .connecting)
    }

    // Asked for again once its session is ending, the receiver a switch leaves waits for that end: its row shows the
    // request meanwhile.
    do {
      let port = port()
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      sheet.change()
      sheet.tap(deviceRow(sheet, bedroom))
      port.emit("ending", livingRoom)
      sheet.tap(deviceRow(sheet, livingRoom))
      check(
        "goingBackOnceTheSessionIsEndingShowsTheRequest",
        status(sheet.state, livingRoom) == .connecting && status(sheet.state, bedroom) == .idle
      )
    }

    // Discovery can lose the receiver that holds the session; its row still leads back to its panel.
    do {
      let port = port()
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      sheet.change()
      port.discover([bedroom])
      sheet.tap(deviceRow(sheet, livingRoom))
      check("theConnectedRowLeadsBackToItsPanelOnceDiscoveryLostIt", panel(sheet.state)?.target.id == livingRoom.id)
    }

    do {
      let port = port()
      let sheet = sheet(port, clock: Clock(), receiverTitle: nil)
      port.emit("started", livingRoom)
      let canStop = panel(sheet.state)?.canStop
      sheet.stop()
      check("withNothingOnTheReceiverTheEndActionDisconnects", canStop == false && port.disconnects == [true])
    }

    do {
      let port = port()
      var outputs: [OutputSheetOutput] = []
      let sheet = sheet(port, clock: Clock()) { outputs.append($0) }
      port.emit("started", livingRoom)
      sheet.change()
      if let first = rows(sheet.state).first { sheet.tap(first) }
      check("thisDeviceChosenWhileCastingStopsTheTarget", port.disconnects == [true] && outputs == [.dismiss])
    }

    do {
      let port = port()
      let clock = Clock()
      let sheet = sheet(port, clock: clock)
      let open = port.discovering
      sheet.close()
      check("closingTheSheetStopsDiscovery", open && !port.discovering && clock.pending == 0)
    }

    // Rotating a tablet moves the sheet to a popover and back: what it shows stays as it was.
    do {
      let port = port()
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      sheet.change()
      let before = sheet.state
      sheet.setWidth(720)
      let wide = sheet.layout
      sheet.setWidth(400)
      check("theStateSurvivesALayoutChange", wide == .popover && sheet.layout == .sheet && sheet.state == before)
    }
  }
}
