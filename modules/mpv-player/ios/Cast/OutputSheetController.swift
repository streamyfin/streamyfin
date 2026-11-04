import Foundation

/// What the sheet hands back to the platform: AirPlay's picker, Play Services' dialog, the remote, closing.
enum OutputSheetOutput: Equatable {
  case openAirPlay, resolvePlayServices, remote, dismiss
}

/// What the screen that opened the sheet knows, and the hub does not.
struct OutputSheetEnvironment {
  var playServices: PlayServicesStatus = .available
  var airPlay: AirPlayInput?
  var thisDevice: ThisDeviceKind = .phone
  var playingHere: String?
  var receiverTitle: String?
}

/// The output sheet's behaviour, on the hub: discovery while it is open, the requests a tap makes, and the
/// slider held between a release and the receiver's echo. Main thread only, like the hub. The same
/// controller as OutputSheetController.kt.
final class OutputSheetController: RemoteTargetListener {
  var environment = OutputSheetEnvironment() {
    didSet { publish() }
  }
  var onState: ((OutputSheetState) -> Void)?
  var onOutput: ((OutputSheetOutput) -> Void)?
  private(set) var layout = OutputLayout.sheet
  private(set) var state: OutputSheetState = .list([])

  private let hub: RemoteTargetHub
  private let schedule: (Double, @escaping () -> Void) -> (() -> Void)
  private var isOpen = false
  private var searchTimedOut = false
  private var showingList = false
  private var dragged: Double?
  private var held: Double?
  private var requestedId: String?
  /// The receiver whose connection brings the panel back over the list "Change" opened.
  private var panelOn: String?
  private var removeListener: (() -> Void)?
  private var cancelSearch: (() -> Void)?
  private var cancelSettle: (() -> Void)?

  init(hub: RemoteTargetHub, schedule: @escaping (Double, @escaping () -> Void) -> (() -> Void)) {
    self.hub = hub
    self.schedule = schedule
    state = outputSheetState(input())
  }

  func open() {
    guard !isOpen else { return }
    isOpen = true
    searchTimedOut = false
    removeListener = hub.addListener(self)
    hub.startDiscovery(owner: RemoteTargetHub.sheetDiscovery)
    cancelSearch = schedule(RemoteTargetConstants.outputSearchTimeoutMs) { [weak self] in
      guard let self else { return }
      cancelSearch = nil
      searchTimedOut = true
      publish()
    }
    publish()
  }

  func close() {
    guard isOpen else { return }
    isOpen = false
    cancelSearch?()
    cancelSearch = nil
    cancelSettle?()
    cancelSettle = nil
    removeListener?()
    removeListener = nil
    hub.stopDiscovery(owner: RemoteTargetHub.sheetDiscovery)
    showingList = false
    dragged = nil
    held = nil
    requestedId = nil
    panelOn = nil
  }

  func tap(_ row: OutputRow) {
    switch row {
    case let .device(id, _, _, _):
      connect(id)
    case .thisDevice:
      // Playback comes back to this phone: the target stops (the hand-off at the position comes with B4).
      if hub.snapshot.phase != .none { hub.disconnect(stopPlayback: true) }
      onOutput?(.dismiss)
    case .airPlay:
      onOutput?(.openAirPlay)
    case let .status(status):
      if status == .playServicesMissing || status == .playServicesUpdate { onOutput?(.resolvePlayServices) }
    }
  }

  /// A connection or a switch on its way: the session goes, the asked receiver with it.
  func cancel() {
    requestedId = nil
    panelOn = nil
    hub.disconnect(stopPlayback: true)
    publish()
  }

  func change() {
    showingList = true
    publish()
  }

  func dragVolume(_ level: Double) {
    dragged = min(max(level, 0), 1)
    publish()
  }

  /// Sent once, at the release; the slider keeps that level until the receiver echoes it, or a moment.
  func releaseVolume(_ level: Double) {
    let sent = min(max(level, 0), 1)
    dragged = nil
    held = sent
    hub.setVolume(sent)
    cancelSettle?()
    cancelSettle = schedule(RemoteTargetConstants.volumeSettleMs) { [weak self] in
      guard let self else { return }
      cancelSettle = nil
      held = nil
      publish()
    }
    publish()
  }

  func toggleMute() {
    hub.setMuted(!hub.snapshot.muted)
  }

  /// The one end action: it closes the receiver app, as the end of a session this phone launched does anyway.
  func stop() {
    requestedId = nil
    hub.disconnect(stopPlayback: true)
  }

  func remote() {
    onOutput?(.remote)
  }

  /// A rotation moves the sheet to a popover and back; what it shows stays as it was.
  func setWidth(_ widthDp: Int) {
    layout = outputLayout(widthDp: widthDp)
  }

  func remoteTargetDidChange(_ snapshot: RemoteTargetSnapshot) {
    if let sent = held, let level = snapshot.volume, abs(level - sent) <= RemoteTargetConstants.volumeEchoTolerance {
      held = nil
      cancelSettle?()
      cancelSettle = nil
    }
    // The asked receiver took the session, or refused it: the state says so from now on.
    if let asked = requestedId, snapshot.target?.id == asked || snapshot.failedTarget?.id == asked {
      requestedId = nil
    }
    if let panel = panelOn {
      if snapshot.error != nil, snapshot.failedTarget?.id == panel { panelOn = nil }
      if snapshot.phase == .connected, snapshot.target?.id == panel {
        panelOn = nil
        showingList = false
      }
    }
    publish()
  }

  func remoteTargetDevicesDidChange(_ devices: [TargetDevice]) {
    publish()
  }

  private func connect(_ deviceId: String) {
    let holder = hub.snapshot.target
    guard hub.connect(deviceId: deviceId) else { return }
    if holder?.id == deviceId {
      // The receiver already there: back to its panel.
      showingList = false
    } else {
      // Over another receiver's session the hub waits for its end: the row shows the request meanwhile,
      // and the list stays until the asked receiver is connected.
      requestedId = holder == nil ? nil : deviceId
      panelOn = deviceId
    }
    publish()
  }

  private func input() -> OutputSheetInput {
    OutputSheetInput(
      snapshot: hub.snapshot, devices: hub.devices, discovering: isOpen, searchTimedOut: searchTimedOut,
      playServices: environment.playServices, airPlay: environment.airPlay, thisDevice: environment.thisDevice,
      playingHere: environment.playingHere, receiverTitle: environment.receiverTitle, showingList: showingList,
      draggedVolume: dragged ?? held, requestedId: requestedId
    )
  }

  private func publish() {
    let next = outputSheetState(input())
    guard next != state else { return }
    state = next
    onState?(next)
  }
}
