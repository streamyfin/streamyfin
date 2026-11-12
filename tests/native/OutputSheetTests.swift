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

    // A suspended session is still the receiver's: its panel stays, reading Reconnecting, while the SDK reaches it
    // again, instead of a list whose Cancel would end it (bench 05/11, iOS back from the background).
    do {
      let reconnecting = RemoteTargetSnapshot(
        phase: .connecting, target: .cast(livingRoom), reconnecting: true, error: nil, volume: 0.5
      )
      var playing = input(snapshot: reconnecting)
      playing.receiverPlaying = true
      let shown = panel(outputSheetState(playing))
      check(
        "aReconnectingTargetKeepsItsPanel",
        shown?.target.id == "device-a" && shown?.reconnecting == true && shown?.canStop == true
      )
    }

    // The hub sends no volume or mute until the session is back: the row stays, held still, so the panel keeps its
    // height and offers nothing that would do nothing.
    do {
      let reconnecting = RemoteTargetSnapshot(
        phase: .connecting, target: .cast(livingRoom), reconnecting: true, error: nil, volume: 0.5
      )
      let shown = panel(outputSheetState(input(snapshot: reconnecting)))
      check(
        "aReconnectingPanelHoldsItsVolumeStill",
        shown?.showsVolume == true && shown?.canSetVolume == false && shown?.canMute == false
      )
    }

    // Over a receiver that plays, outside the player, this phone's row offers to take the video over where it is.
    do {
      let connected = RemoteTargetSnapshot(
        phase: .connected, target: .cast(livingRoom), reconnecting: false, error: nil, volume: 0.5
      )
      func continueHere(
        playing: Bool, handOff: Bool, goesOnHere: Bool? = nil, playingHere: String? = nil,
        snapshot: RemoteTargetSnapshot? = nil
      ) -> Bool? {
        var list = input(snapshot: snapshot ?? connected)
        list.playingHere = playingHere
        list.receiverPlaying = playing
        list.receiverGoesOnHere = goesOnHere ?? playing
        list.showingList = true
        list.handOff = handOff
        if case let .thisDevice(_, _, continueHere) = rows(outputSheetState(list)).first { return continueHere }
        return nil
      }
      check(
        "thisDeviceOffersToContinueWhileTheReceiverPlays",
        continueHere(playing: true, handOff: false) == true && continueHere(playing: false, handOff: false) == false
          && continueHere(playing: true, handOff: true) == false
      )
      // Music, live TV and media another sender loaded stay on the receiver: the row offers nothing to take over.
      check(
        "thisDeviceOffersNothingOfWhatStaysOnTheReceiver",
        continueHere(playing: true, handOff: false, goesOnHere: false) == false
      )
      // Music plays on this phone: its row says so and only stops the receiver, as before.
      check(
        "musicPlayingHereKeepsTheRowAStop",
        continueHere(playing: true, handOff: false, playingHere: "Lever du jour") == false
      )
      // A receiver stopped from the TV keeps its media with nothing playing, and a suspended session holds its last
      // status while it reconnects: neither offers Continue here.
      let reconnecting = RemoteTargetSnapshot(
        phase: .connecting, target: .cast(livingRoom), reconnecting: true, error: nil, volume: 0.5
      )
      check(
        "aStoppedOrReconnectingReceiverOffersNothing",
        continueHere(playing: false, handOff: false, goesOnHere: true) == false
          && continueHere(playing: true, handOff: false, goesOnHere: true, snapshot: reconnecting) == false
      )
    }

    // The hand-off waits for the session to be back: a reconnecting receiver takes no item.
    do {
      let reconnecting = RemoteTargetSnapshot(
        phase: .connecting, target: .cast(livingRoom), reconnecting: true, error: nil, volume: 0.5
      )
      let connected = RemoteTargetSnapshot(
        phase: .connected, target: .cast(livingRoom), reconnecting: false, error: nil, volume: 0.5
      )
      var held = input(snapshot: reconnecting)
      held.handOff = true
      var back = input(snapshot: connected)
      back.handOff = true
      check(
        "noHandOffWhileReconnecting",
        panel(outputSheetState(held))?.canHandOff == false && panel(outputSheetState(back))?.canHandOff == true
      )
    }

    // A suspended session loses its media client until it resumes, and the resumed client reports nothing until the
    // receiver sends: the last status heard stands in meanwhile, until the receiver reports again or the session ends.
    do {
      var heard = LastHeardStatus<String>()
      heard.hold("playing")
      let suspended = heard.read(nil)
      let reported = heard.read("paused")
      heard.forget()
      check(
        "aSuspendedSessionReadsItsLastStatusUntilTheReceiverReports",
        suspended == "playing" && reported == "paused" && heard.read(nil) == nil
      )
    }

    // Resumed, the client may not have reported when the session is suspended again: the status from the first
    // suspension still stands.
    do {
      var heard = LastHeardStatus<String>()
      heard.hold("playing")
      heard.hold(nil)
      check("aSecondSuspensionBeforeAnyReportKeepsTheStatus", heard.read(nil) == "playing")
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

    // A cause outside the families reads as a failed connection: the SDK's own text, untranslated and with its
    // code, is for the log.
    check(
      "anUnknownCauseReadsAsAFailedConnection",
      OutputPickerStrings(["failed": "La connexion a échoué"]).cause(.other("com.google.GCKError 5")) == "La connexion a échoué"
        && OutputPickerStrings().cause(.other("")) == "The connection failed"
    )

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
      let playing = receiverPlaying ?? (receiverTitle != nil)
      sheet.environment = OutputSheetEnvironment(
        receiverTitle: receiverTitle, receiverPlaying: playing, receiverGoesOnHere: playing
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

    // Opened from the player, the connection the sheet asks for hands the video off, once, instead of drawing the panel.
    do {
      let port = port()
      var outputs: [OutputSheetOutput] = []
      let sheet = sheet(port, clock: Clock()) { outputs.append($0) }
      sheet.environment.handOff = true
      sheet.tap(deviceRow(sheet, livingRoom))
      port.emit("started", livingRoom)
      port.events?.volumeChanged(level: 0.5, muted: false)
      check("aConnectionMadeFromThePlayerHandsOff", outputs == [.handOff])
    }

    // Opened from the player over a receiver already connected, the panel offers to play there.
    do {
      let port = port()
      var outputs: [OutputSheetOutput] = []
      let sheet = sheet(port, clock: Clock()) { outputs.append($0) }
      sheet.environment.handOff = true
      port.emit("started", livingRoom)
      let offered = panel(sheet.state)?.canHandOff == true
      sheet.handOff()
      check("aConnectedTargetOffersTheHandOffInThePanel", offered && outputs == [.handOff])
    }

    // Opened anywhere else, the same connection draws the panel and hands nothing off.
    do {
      let port = port()
      var outputs: [OutputSheetOutput] = []
      let sheet = sheet(port, clock: Clock()) { outputs.append($0) }
      sheet.tap(deviceRow(sheet, livingRoom))
      port.emit("started", livingRoom)
      let shown = panel(sheet.state)
      check(
        "outsideThePlayerNothingHandsOff",
        shown?.target.id == "device-a" && shown?.canHandOff == false && outputs.isEmpty
      )
    }

    // A failure is read once: the sheet that showed it clears it on closing, and the next one opens clean.
    do {
      let port = port()
      let hub = RemoteTargetHub()
      hub.install(port)
      func opened() -> OutputSheetController {
        let sheet = OutputSheetController(hub: hub, schedule: Clock().schedule)
        sheet.environment = OutputSheetEnvironment(receiverTitle: nil, receiverPlaying: false)
        sheet.open()
        return sheet
      }
      let first = opened()
      port.emit("startFailed", bedroom, error: "timeout")
      var shown = false
      if case .failed = status(first.state, bedroom) { shown = true }
      first.close()
      check(
        "closingTheSheetClearsTheFailureItShowed",
        shown && hub.snapshot.error == nil && status(opened().state, bedroom) == .idle
      )
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

    // The same refusal again: the row reads the failure again, not a connection that never ends, whose Cancel would
    // stop the receiver that plays.
    do {
      let port = FakeTargetPort(known: [livingRoom, bedroom], listsOnDiscovery: true, refuses: [bedroom.id])
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      sheet.change()
      sheet.tap(deviceRow(sheet, bedroom))
      sheet.tap(deviceRow(sheet, bedroom))
      var failed = false
      if case .failed = status(sheet.state, bedroom) { failed = true }
      check("aSwitchRefusedTwiceShowsItsFailureAgain", failed)
    }

    // The failure an earlier refusal left is not the answer to the next request: a report of the session that holds,
    // before it ends for the switch, leaves the row waiting, and the panel comes back once the receiver connects.
    do {
      let port = FakeTargetPort(known: [livingRoom, bedroom], listsOnDiscovery: true, refuses: [bedroom.id])
      let sheet = sheet(port, clock: Clock())
      port.emit("started", livingRoom)
      sheet.change()
      sheet.tap(deviceRow(sheet, bedroom))
      port.refuses = []
      sheet.tap(deviceRow(sheet, bedroom))
      port.events?.volumeChanged(level: 0.4, muted: false)
      let waiting = status(sheet.state, bedroom)
      port.emit("ending", livingRoom)
      port.emit("ended", livingRoom)
      port.emit("started", bedroom)
      check(
        "aRequestAfterARefusalIsNotAnsweredByThatRefusal",
        waiting == .connecting && panel(sheet.state)?.target.id == bedroom.id
      )
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

    // Stopped or disconnected, the sheet closes, as the Cast SDK's dialog does: left open on the list, a tap meant for
    // the sheet's next screen would pick a receiver.
    do {
      let port = port()
      var outputs: [OutputSheetOutput] = []
      let sheet = sheet(port, clock: Clock()) { outputs.append($0) }
      port.emit("started", livingRoom)
      sheet.stop()
      check("theEndActionClosesTheSheet", port.disconnects == [true] && outputs == [.dismiss])
    }

    // While the receiver plays, outside the player, this phone takes its video over where it is: JS reads the
    // receiver before it stops it, so the sheet stops nothing itself.
    do {
      let port = port()
      var outputs: [OutputSheetOutput] = []
      let sheet = sheet(port, clock: Clock()) { outputs.append($0) }
      port.emit("started", livingRoom)
      sheet.change()
      if let first = rows(sheet.state).first { sheet.tap(first) }
      check("thisDeviceWhileTheReceiverPlaysContinuesHere", port.disconnects.isEmpty && outputs == [.playHere])
    }

    do {
      let port = port()
      var outputs: [OutputSheetOutput] = []
      let sheet = sheet(port, clock: Clock(), receiverTitle: nil) { outputs.append($0) }
      port.emit("started", livingRoom)
      sheet.change()
      if let first = rows(sheet.state).first { sheet.tap(first) }
      check("thisDeviceWithNothingOnTheReceiverStopsIt", port.disconnects == [true] && outputs == [.dismiss])
    }

    // Music, live TV and media another sender loaded stay on the receiver: this phone stops it, as before.
    do {
      let port = port()
      var outputs: [OutputSheetOutput] = []
      let sheet = sheet(port, clock: Clock()) { outputs.append($0) }
      sheet.environment.receiverGoesOnHere = false
      port.emit("started", livingRoom)
      sheet.change()
      if let first = rows(sheet.state).first { sheet.tap(first) }
      check("thisDeviceWithMusicOnTheReceiverStopsIt", port.disconnects == [true] && outputs == [.dismiss])
    }

    // In the player, the phone already has its video: this phone stops the receiver, as before.
    do {
      let port = port()
      var outputs: [OutputSheetOutput] = []
      let sheet = sheet(port, clock: Clock()) { outputs.append($0) }
      sheet.environment.handOff = true
      port.emit("started", livingRoom)
      sheet.change()
      if let first = rows(sheet.state).first { sheet.tap(first) }
      check("inThePlayerThisDeviceStillStopsTheReceiver", port.disconnects == [true] && outputs == [.dismiss])
    }

    do {
      let port = port()
      let clock = Clock()
      let sheet = sheet(port, clock: clock)
      let open = port.discovering
      sheet.close()
      check("closingTheSheetStopsDiscovery", open && !port.discovering && clock.pending == 0)
    }

  }
}
