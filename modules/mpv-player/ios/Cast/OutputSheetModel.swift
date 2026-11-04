import Foundation

// The output sheet as a value: what it shows follows from the target state and from the screen that
// opened it, so both platforms draw the same sheet and the tests read it without a UI. The same model as
// OutputSheetModel.kt.

/// Whether discovery can run: Android needs Play Services; iOS always can.
enum PlayServicesStatus: Equatable {
  case available, missing, updateRequired
}

enum ThisDeviceKind: Equatable {
  case phone, tablet
}

/// The AirPlay row, with the name of the route in use when there is one.
struct AirPlayInput: Equatable {
  let activeRoute: String?
}

struct OutputSheetInput {
  var snapshot: RemoteTargetSnapshot
  var devices: [TargetDevice]
  var discovering: Bool
  var searchTimedOut: Bool
  var playServices: PlayServicesStatus
  var airPlay: AirPlayInput?
  var thisDevice: ThisDeviceKind
  /// What plays on this device, nil when nothing does.
  var playingHere: String?
  /// What the receiver plays, nil when it plays nothing.
  var receiverTitle: String?
  /// "Change" asked for the list over a connected target.
  var showingList: Bool
  /// The level under the finger, or the one sent until the receiver echoes it.
  var draggedVolume: Double?
  /// The receiver tapped while another holds the session: the hub starts it once that session ends.
  var requestedId: String?
}

enum FailureCause: Equatable {
  case deviceGone, receiverUnavailable, network
  case other(String)
}

enum DeviceStatus: Equatable {
  case idle, connecting, connected
  case failed(FailureCause)
}

enum SheetStatus: Equatable {
  case searching, noDevices, playServicesMissing, playServicesUpdate
}

enum OutputRow: Equatable {
  case thisDevice(kind: ThisDeviceKind, playing: String?)
  case device(id: String, name: String, videoOut: Bool, status: DeviceStatus)
  case airPlay(activeRoute: String?)
  case status(SheetStatus)
}

struct ConnectedPanel: Equatable {
  let target: RemoteTarget
  /// From discovery's record of the target: a speaker has none.
  let videoOut: Bool
  let volume: Double?
  let muted: Bool
  let canSetVolume: Bool
  /// iOS mutes the receiver itself, which takes nothing playing; Android waits for a stream to mute.
  let canMute: Bool
  let reconnecting: Bool
  let receiverTitle: String?
  /// The receiver plays something: the end action reads "Stop playback" and the remote is offered.
  /// Otherwise it reads "Disconnect"; both close the receiver app, which the session that launched it
  /// does at its end whatever it asks.
  let canStop: Bool
}

enum OutputSheetState: Equatable {
  case list([OutputRow])
  case connected(ConnectedPanel)
}

enum OutputLayout: Equatable {
  case sheet, popover
}

func outputLayout(widthDp: Int) -> OutputLayout {
  widthDp >= RemoteTargetConstants.regularWidthDp ? .popover : .sheet
}

// GCKErrorCode, from the google-cast-sdk reference: network, timeout, device not connected, network not
// reachable, disconnected; then the receiver app not found or not running, its variants included.
private let networkCodes: Set<Int> = [1, 2, 14, 17, 92]
private let receiverCodes: Set<Int> = [20, 21, 104, 105, 106, 107]

/// The family of a failure, for the line under its row: the port's refusals by message, the SDK's by code.
func failureCause(error: String?, code: Int?) -> FailureCause {
  if error == GoogleCastTargetPort.receiverGone || error == FakeCastDevices.notOnTheBench { return .deviceGone }
  if error == GoogleCastTargetPort.startRefused || error == GoogleCastTargetPort.endRefused {
    return .receiverUnavailable
  }
  if let code, networkCodes.contains(code) { return .network }
  if let code, receiverCodes.contains(code) { return .receiverUnavailable }
  return .other(error ?? "")
}

func outputSheetState(_ input: OutputSheetInput) -> OutputSheetState {
  let snapshot = input.snapshot
  if snapshot.phase == .connected, let target = snapshot.target, !input.showingList {
    return .connected(
      ConnectedPanel(
        target: target, videoOut: input.devices.first(where: { $0.id == target.id })?.videoOut ?? true,
        volume: input.draggedVolume ?? snapshot.volume, muted: snapshot.muted,
        canSetVolume: target.volume && snapshot.volume != nil,
        canMute: target.volume && snapshot.volume != nil, reconnecting: snapshot.reconnecting,
        receiverTitle: input.receiverTitle, canStop: input.receiverTitle != nil
      )
    )
  }
  var rows: [OutputRow] = [.thisDevice(kind: input.thisDevice, playing: input.playingHere)]
  switch input.playServices {
  case .missing:
    rows.append(.status(.playServicesMissing))
  case .updateRequired:
    rows.append(.status(.playServicesUpdate))
  case .available:
    let devices = withTargets(input.devices, snapshot)
    if devices.isEmpty { rows.append(.status(input.searchTimedOut ? .noDevices : .searching)) }
    // The local order, case left out.
    for device in devices.sorted(by: { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }) {
      rows.append(.device(id: device.id, name: device.name, videoOut: device.videoOut, status: status(of: device, input)))
    }
  }
  if let airPlay = input.airPlay { rows.append(.airPlay(activeRoute: airPlay.activeRoute)) }
  return .list(rows)
}

// The receiver a session or a failure names stays listed when discovery has dropped it.
private func withTargets(_ devices: [TargetDevice], _ snapshot: RemoteTargetSnapshot) -> [TargetDevice] {
  var listed = devices
  let failed = snapshot.error == nil ? nil : snapshot.failedTarget
  for target in [snapshot.target, failed].compactMap({ $0 }) where !listed.contains(where: { $0.id == target.id }) {
    listed.append(TargetDevice(id: target.id, name: target.name))
  }
  return listed
}

private func status(of device: TargetDevice, _ input: OutputSheetInput) -> DeviceStatus {
  let snapshot = input.snapshot
  let onIt = snapshot.target?.id == device.id
  if onIt && snapshot.phase == .connected { return .connected }
  if onIt && snapshot.phase == .connecting { return .connecting }
  if device.id == input.requestedId { return .connecting }
  if let error = snapshot.error, snapshot.failedTarget?.id == device.id {
    return .failed(failureCause(error: error, code: snapshot.errorCode))
  }
  return .idle
}
