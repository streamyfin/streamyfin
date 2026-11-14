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
  /// What the receiver plays, nil when it plays nothing or names nothing.
  var receiverTitle: String?
  /// Something plays on the receiver, with a title or without.
  var receiverPlaying = false
  /// What the receiver plays can go on on this device: a Jellyfin item, neither live TV nor audio.
  var receiverGoesOnHere = false
  /// "Change" asked for the list over a connected target.
  var showingList: Bool
  /// The level under the finger, or the one sent until the receiver echoes it.
  var draggedVolume: Double?
  /// The receiver tapped while another holds the session: the hub starts it once that session ends.
  var requestedId: String?
  /// Opened from the player, whose video the receiver can take.
  var handOff = false
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
  /// `continueHere`: the receiver plays, outside the player, and a tap takes its video over on this device.
  case thisDevice(kind: ThisDeviceKind, playing: String?, continueHere: Bool = false)
  case device(id: String, name: String, videoOut: Bool, status: DeviceStatus)
  case airPlay(activeRoute: String?)
  case status(SheetStatus)

  /// What the row is, whatever its place: discovery reorders the list while a finger is on it.
  var key: String {
    switch self {
    case .thisDevice: return "this-device"
    case let .device(id, _, _, _): return "device:" + id
    case .airPlay: return "airplay"
    case let .status(status): return "status:" + String(describing: status)
    }
  }
}

struct ConnectedPanel: Equatable {
  let target: RemoteTarget
  /// From discovery's record of the target: a speaker has none.
  let videoOut: Bool
  let volume: Double?
  let muted: Bool
  /// The receiver has a level to set: the volume row is drawn.
  let showsVolume: Bool
  /// The row takes a change: not while the session reconnects, as the hub sends none until it is back.
  let canSetVolume: Bool
  /// iOS mutes the receiver itself, which takes nothing playing; Android waits for a stream to mute.
  let canMute: Bool
  let reconnecting: Bool
  let receiverTitle: String?
  /// The receiver plays something: the end action reads "Stop playback" and the remote is offered.
  /// Otherwise it reads "Disconnect"; both close the receiver app, which the session that launched it
  /// does at its end whatever it asks.
  let canStop: Bool
  /// Opened from the player, over a connected receiver: "Play on" hands the video off. Not while reconnecting.
  let canHandOff: Bool
}

enum OutputSheetState: Equatable {
  case list([OutputRow])
  case connected(ConnectedPanel)
}

/// The receiver's media status as the sheet reads it. A suspended session loses its media client until it resumes,
/// and the resumed client reports nothing until the receiver sends: the last status heard stands in meanwhile, so the
/// panel keeps what the receiver plays. Main thread only, like the module that holds it.
struct LastHeardStatus<T> {
  private var held: T?

  /// The session is suspended with this last status; none keeps the one an earlier suspension held.
  mutating func hold(_ last: T?) {
    held = last ?? held
  }

  func read(_ live: T?) -> T? {
    live ?? held
  }

  /// The receiver reported again, or the session ended or gave way to another.
  mutating func forget() {
    held = nil
  }
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
  // A suspended session stays the receiver's while the SDK reaches it again: its panel reads Reconnecting.
  let held = snapshot.phase == .connected || (snapshot.phase == .connecting && snapshot.reconnecting)
  if held, let target = snapshot.target, !input.showingList {
    let showsVolume = target.volume && snapshot.volume != nil
    return .connected(
      ConnectedPanel(
        target: target, videoOut: input.devices.first(where: { $0.id == target.id })?.videoOut ?? true,
        volume: input.draggedVolume ?? snapshot.volume, muted: snapshot.muted, showsVolume: showsVolume,
        canSetVolume: showsVolume && !snapshot.reconnecting, canMute: showsVolume && !snapshot.reconnecting,
        reconnecting: snapshot.reconnecting, receiverTitle: input.receiverTitle, canStop: input.receiverPlaying,
        canHandOff: input.handOff && snapshot.phase == .connected
      )
    )
  }
  // In the player the phone already has its video, and music playing here would be covered by it: there this row
  // stops the receiver, as before.
  let continueHere =
    !input.handOff && input.playingHere == nil && snapshot.phase == .connected && input.receiverPlaying
    && input.receiverGoesOnHere
  var rows: [OutputRow] = [.thisDevice(kind: input.thisDevice, playing: input.playingHere, continueHere: continueHere)]
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
