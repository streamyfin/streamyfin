import Foundation

/// Hears the target state and the receivers through the hub.
protocol RemoteTargetListener: AnyObject {
  func remoteTargetDidChange(_ snapshot: RemoteTargetSnapshot)
  func remoteTargetDevicesDidChange(_ devices: [TargetDevice])
}

/// What a port tells the hub: the SDK's session events, under the names the module emits, and what discovery sees.
protocol TargetPortEvents: AnyObject {
  func sessionEvent(_ event: String, device: TargetDevice?, error: String?)
  /// The same, with the SDK's status code for `error` when the SDK gave one.
  func sessionEvent(_ event: String, device: TargetDevice?, error: String?, code: Int?)
  func devicesChanged(_ devices: [TargetDevice])
  /// The receiver's volume, 0 to 1, and its mute, as the SDK reports them for the current session.
  func volumeChanged(level: Double, muted: Bool)
}

extension TargetPortEvents {
  func sessionEvent(_ event: String, device: TargetDevice?, error: String?, code: Int?) {
    sessionEvent(event, device: device, error: error)
  }

  func volumeChanged(level: Double, muted: Bool) {}
}

/// The receivers as the hub reaches them: the Cast SDK (GoogleCastTargetPort), or the fake ones a
/// tier 1 build asks for. Main thread only, like the SDK.
protocol TargetPort: AnyObject {
  /// A session already running when the port starts is reported as resumed.
  func start(events: TargetPortEvents)
  func stop()
  func devices() -> [TargetDevice]
  func startDiscovery()
  func stopDiscovery()
  /// Always answered with session events: a connection the port cannot start ends in startFailed.
  func connect(_ device: TargetDevice)
  func disconnect(stopPlayback: Bool)
  /// The current session's receiver volume, 0 to 1; the state follows what the SDK reports back.
  func setVolume(_ level: Double)
  func setMuted(_ muted: Bool)
}

/// Where playback goes, for the whole process: the module publishes it to JS, and native callers
/// (the debug probe) read and drive it without JS in between. The hub reaches the receivers through
/// one port at a time and holds its listeners weakly. Main thread only; `snapshot` and `devices`
/// can be read from any thread.
final class RemoteTargetHub {
  static let shared = RemoteTargetHub()
  /// The app's own discovery request: the module, for JS.
  static let appDiscovery = "app"
  /// The debug probe's.
  static let probeDiscovery = "probe"

  private struct Listener {
    let token: Int
    weak var listener: RemoteTargetListener?
  }

  private var machine = RemoteTargetMachine()
  private var listeners: [Listener] = []
  private var nextToken = 0
  private var port: TargetPort?
  // Discovery runs while anyone still asks for it: each owner releases only its own request.
  private var discoveryOwners: Set<String> = []
  // Written on the main thread, read by the module's synchronous getter from the JS thread.
  private let lock = NSLock()
  private var publishedSnapshot = RemoteTargetSnapshot.none
  private var publishedDevices: [TargetDevice] = []

  var snapshot: RemoteTargetSnapshot { locked { publishedSnapshot } }
  var devices: [TargetDevice] { locked { publishedDevices } }
  /// True after a disconnect that asked to keep the receiver playing, until the next connection; the module
  /// marks the end it brings. The receiver keeps playing only when this session joined it: the session that
  /// launched the receiver app stops it at its end whatever it asks, on both SDKs (bench, 04/11).
  private(set) var disconnectedWithoutStop = false

  /// The same port again does nothing, so every JS reload can install it.
  func install(_ port: TargetPort) {
    if port === self.port { return }
    self.port?.stop()
    self.port = port
    // A target the old port reported means nothing to the new one.
    machine = RemoteTargetMachine()
    publish()
    updateDevices([])
    // The devices come from discovery, as before the hub: a port lists none until it is asked to look.
    port.start(events: PortEvents(hub: self, port: port))
    if !discoveryOwners.isEmpty { port.startDiscovery() }
  }

  /// A new listener hears changes from now on; it reads `snapshot` and `devices` for the present.
  func addListener(_ listener: RemoteTargetListener) -> () -> Void {
    nextToken += 1
    let token = nextToken
    listeners.append(Listener(token: token, listener: listener))
    return { [weak self] in self?.listeners.removeAll { $0.token == token } }
  }

  /// False, with nothing changed, when the port does not know the device.
  func connect(deviceId: String) -> Bool {
    guard let port, let device = port.devices().first(where: { $0.id == deviceId }) else { return false }
    disconnectedWithoutStop = false
    let current = snapshot
    let held = current.target?.id == deviceId && (current.phase == .connecting || current.phase == .connected)
    // The receiver already there asks nothing, unless a switch is taking its session away.
    if held && !machine.isSwitching { return true }
    // Announced before the port is asked: its first event can come back inside connect.
    if machine.connectRequested(device) { publish() }
    // While another device is connected, the port ends that session before this one starts: the
    // Android SDK does it on route selection, the iOS port asks for it.
    port.connect(device)
    return true
  }

  /// The state follows the port's events, ending then ended, not this call.
  func disconnect(stopPlayback: Bool) {
    disconnectedWithoutStop = !stopPlayback
    machine.disconnectRequested()
    port?.disconnect(stopPlayback: stopPlayback)
  }

  /// Bounded to 0...1, and only for a connected receiver: the state follows what the SDK reports back.
  func setVolume(_ level: Double) {
    guard snapshot.phase == .connected else { return }
    port?.setVolume(min(max(level, 0), 1))
  }

  func setMuted(_ muted: Bool) {
    guard snapshot.phase == .connected else { return }
    port?.setMuted(muted)
  }

  /// `owner` names who asks (`appDiscovery`, `probeDiscovery`); asking twice still takes one stop.
  func startDiscovery(owner: String) {
    if discoveryOwners.insert(owner).inserted, discoveryOwners.count == 1 { port?.startDiscovery() }
  }

  func stopDiscovery(owner: String) {
    if discoveryOwners.remove(owner) != nil, discoveryOwners.isEmpty { port?.stopDiscovery() }
  }

  fileprivate func sessionEvent(from port: TargetPort, _ event: String, device: TargetDevice?, error: String?, code: Int?) {
    guard port === self.port else { return }
    // A session the SDK starts on its own, from its dialog, is a new connection too.
    if event == "starting" { disconnectedWithoutStop = false }
    if machine.sessionEvent(event, device: device, error: error, code: code) { publish() }
  }

  fileprivate func volumeChanged(from port: TargetPort, level: Double, muted: Bool) {
    guard port === self.port else { return }
    if machine.volumeChanged(level: level, muted: muted) { publish() }
  }

  fileprivate func devicesChanged(from port: TargetPort, _ devices: [TargetDevice]) {
    guard port === self.port else { return }
    updateDevices(devices)
  }

  private func publish() {
    let next = machine.snapshot
    let changed: Bool = locked {
      guard next != publishedSnapshot else { return false }
      publishedSnapshot = next
      return true
    }
    guard changed else { return }
    liveListeners().forEach { $0.remoteTargetDidChange(next) }
  }

  private func updateDevices(_ next: [TargetDevice]) {
    let changed: Bool = locked {
      guard next != publishedDevices else { return false }
      publishedDevices = next
      return true
    }
    guard changed else { return }
    liveListeners().forEach { $0.remoteTargetDevicesDidChange(next) }
  }

  private func liveListeners() -> [RemoteTargetListener] {
    listeners.removeAll { $0.listener == nil }
    return listeners.compactMap(\.listener)
  }

  private func locked<T>(_ read: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return read()
  }
}

/// One port's events: a port replaced, or stopped late, is no longer heard.
private final class PortEvents: TargetPortEvents {
  private weak var hub: RemoteTargetHub?
  private weak var port: TargetPort?

  init(hub: RemoteTargetHub, port: TargetPort) {
    self.hub = hub
    self.port = port
  }

  func sessionEvent(_ event: String, device: TargetDevice?, error: String?) {
    sessionEvent(event, device: device, error: error, code: nil)
  }

  func sessionEvent(_ event: String, device: TargetDevice?, error: String?, code: Int?) {
    guard let hub, let port else { return }
    hub.sessionEvent(from: port, event, device: device, error: error, code: code)
  }

  func volumeChanged(level: Double, muted: Bool) {
    guard let hub, let port else { return }
    hub.volumeChanged(from: port, level: level, muted: muted)
  }

  func devicesChanged(_ devices: [TargetDevice]) {
    guard let hub, let port else { return }
    hub.devicesChanged(from: port, devices)
  }
}
