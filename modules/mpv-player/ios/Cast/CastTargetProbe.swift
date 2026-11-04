import Foundation

// The device proof of the remote target (e2e/suites/cast/README.md, "Remote target probe"): a launch
// argument names a receiver in debug builds; the probe waits for discovery to list it, connects through
// the hub, holds the session, disconnects and waits for none, logging every state on the way.
final class CastTargetProbe: RemoteTargetListener {
  static let launchArgument = "CastTargetProbe"
  /// Leaves the session up: the relaunch proof arms a second probe on it.
  static let keepArgument = "CastTargetProbeKeep"
  /// Holds the session that many milliseconds before the disconnection.
  static let holdArgument = "CastTargetProbeHold"
  /// A second receiver, asked once the first is connected (iOS only: Android sends a second broadcast).
  static let thenArgument = "CastTargetProbeThen"
  static let discoveryTimeoutMs = 15_000.0
  static let partialMatchSettleMs = 3_000.0
  // Longer than the SDK's own connection timeout, which answers startFailed first.
  static let connectTimeoutMs = 30_000.0
  static let connectedHoldMs = 5_000.0
  static let endTimeoutMs = 20_000.0

  private let hub: RemoteTargetHub
  private let deviceName: String
  private let keep: Bool
  /// How long a connected session is held before the disconnection: long enough to cut the network in.
  private let holdMs: Double
  private let schedule: (Double, @escaping () -> Void) -> (() -> Void)
  private let log: (String) -> Void
  private(set) var isActive = false
  /// Hears the last line once the run ends: the iOS chain arms its next probe from it.
  var onFinish: ((String) -> Void)?
  private var removeListener: (() -> Void)?
  private var cancelWait: (() -> Void)?
  private var settle: (() -> Void)?
  private var device: TargetDevice?
  private var connected = false

  init(
    hub: RemoteTargetHub, deviceName: String, keep: Bool, holdMs: Double = CastTargetProbe.connectedHoldMs,
    schedule: @escaping (Double, @escaping () -> Void) -> (() -> Void), log: @escaping (String) -> Void
  ) {
    self.holdMs = holdMs
    self.hub = hub
    self.deviceName = deviceName
    self.keep = keep
    self.schedule = schedule
    self.log = log
  }

  static func describe(_ snapshot: RemoteTargetSnapshot) -> String {
    "state=\(snapshot.phase.rawValue) target=\(snapshot.target?.name ?? "-") "
      + "reconnecting=\(snapshot.reconnecting) error=\(snapshot.error ?? "-")"
  }

  func start() {
    isActive = true
    removeListener = hub.addListener(self)
    let current = hub.snapshot
    log("armed for \"\(deviceName)\" \(Self.describe(current))")
    // A whole name only: a part of one may name another receiver than the connected one.
    if current.phase == .connected, let target = current.target,
      target.name.caseInsensitiveCompare(deviceName) == .orderedSame
    {
      log("already connected to \(target.name)")
      onConnected()
      return
    }
    // Set first: a port can list its receivers inside startDiscovery, and a connection started there
    // sets its own wait, which this one must not replace.
    wait(Self.discoveryTimeoutMs, failure: "no device named \"\(deviceName)\"")
    hub.startDiscovery(owner: RemoteTargetHub.probeDiscovery)
    remoteTargetDevicesDidChange(hub.devices)
  }

  func remoteTargetDevicesDidChange(_ devices: [TargetDevice]) {
    guard isActive, device == nil else { return }
    // A whole name connects at once. A part of one waits: iOS lists receivers one at a time, and on
    // the bench "Salon" may come after "Salon - Chromecast".
    if let whole = devices.first(where: isWholeName) {
      connect(whole)
      return
    }
    guard settle == nil, devices.contains(where: { matches($0.name) }) else { return }
    settle = schedule(Self.partialMatchSettleMs) { [weak self] in
      guard let self else { return }
      // Spent either way: a receiver that left meanwhile can settle again when it comes back.
      settle = nil
      let listed = hub.devices
      if let found = listed.first(where: isWholeName) ?? listed.first(where: { self.matches($0.name) }) {
        connect(found)
      }
    }
  }

  private func connect(_ found: TargetDevice) {
    guard isActive, device == nil else { return }
    settle?()
    settle = nil
    device = found
    log("found \(found.name)")
    guard hub.connect(deviceId: found.id) else {
      fail("the hub refused \(found.name)")
      return
    }
    // The hub asks nothing for the receiver already connected, so no event will come.
    let now = hub.snapshot
    if !connected, now.phase == .connected, now.target?.id == found.id {
      log("already connected to \(found.name)")
      onConnected()
      return
    }
    if !connected && isActive { wait(Self.connectTimeoutMs, failure: "never connected") }
  }

  func remoteTargetDidChange(_ snapshot: RemoteTargetSnapshot) {
    guard isActive else { return }
    log(Self.describe(snapshot))
    switch snapshot.phase {
    case .connected:
      // Only the receiver it found: the SDK can resume another session meanwhile, after a relaunch.
      if !connected, let device, snapshot.target?.id == device.id { onConnected() }
    case .none:
      // A none without an error before the connection is a switch's old session ending: the asked
      // receiver comes next, or the connection wait says it never did.
      if connected {
        finish("done")
      } else if device != nil, let error = snapshot.error {
        fail("connection failed error=\(error)")
      }
    default:
      break
    }
  }

  private func onConnected() {
    connected = true
    cancelWait?()
    if keep {
      finish("done, still connected")
      return
    }
    cancelWait = schedule(holdMs) { [weak self] in
      guard let self else { return }
      log("disconnecting")
      wait(Self.endTimeoutMs, failure: "never ended")
      hub.disconnect(stopPlayback: true)
    }
  }

  private func matches(_ name: String) -> Bool {
    name.range(of: deviceName, options: .caseInsensitive) != nil
  }

  private func isWholeName(_ device: TargetDevice) -> Bool {
    device.name.caseInsensitiveCompare(deviceName) == .orderedSame
  }

  private func wait(_ delayMs: Double, failure: String) {
    cancelWait?()
    cancelWait = schedule(delayMs) { [weak self] in self?.fail(failure) }
  }

  private func fail(_ reason: String) {
    finish("failed: " + reason)
  }

  private func finish(_ result: String) {
    guard isActive else { return }
    isActive = false
    cancelWait?()
    cancelWait = nil
    settle?()
    settle = nil
    removeListener?()
    removeListener = nil
    hub.stopDiscovery(owner: RemoteTargetHub.probeDiscovery)
    log(result)
    onFinish?(result)
  }
}
