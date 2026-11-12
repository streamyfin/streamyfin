import Foundation

/// Stands in for the SDK: records what the hub asks, and replays the events a test hands it.
final class FakeTargetPort: TargetPort {
  private let atStart: [(String, TargetDevice?, String?)]
  var known: [TargetDevice]
  /// Lists `known` inside startDiscovery, as the Android SDK port does with the routes MediaRouter has.
  private let listsOnDiscovery: Bool
  /// Devices whose connection the port answers at once with startFailed, as a disabled route is.
  var refuses: Set<String>
  // Kept after stop, so a test can play a stale port talking to the hub.
  var events: TargetPortEvents?
  var starts = 0
  var stopped = false
  var discovering = false
  var connects: [TargetDevice] = []
  var disconnects: [Bool] = []
  var volumes: [Double] = []
  var mutes: [Bool] = []

  init(
    atStart: [(String, TargetDevice?, String?)] = [], known: [TargetDevice] = [], listsOnDiscovery: Bool = false,
    refuses: Set<String> = []
  ) {
    self.atStart = atStart
    self.known = known
    self.listsOnDiscovery = listsOnDiscovery
    self.refuses = refuses
  }

  func start(events: TargetPortEvents) {
    self.events = events
    starts += 1
    for (event, device, error) in atStart {
      events.sessionEvent(event, device: device, error: error)
    }
  }

  func stop() { stopped = true }

  func devices() -> [TargetDevice] { known }

  func startDiscovery() {
    discovering = true
    if listsOnDiscovery { events?.devicesChanged(known) }
  }

  func stopDiscovery() { discovering = false }

  func connect(_ device: TargetDevice) {
    connects.append(device)
    if refuses.contains(device.id) { events?.sessionEvent("startFailed", device: device, error: "refused") }
  }

  func disconnect(stopPlayback: Bool) { disconnects.append(stopPlayback) }

  func setVolume(_ level: Double) { volumes.append(level) }

  func setMuted(_ muted: Bool) { mutes.append(muted) }

  func emit(_ event: String, _ device: TargetDevice?, error: String? = nil) {
    events?.sessionEvent(event, device: device, error: error)
  }

  func discover(_ devices: [TargetDevice]) {
    known = devices
    events?.devicesChanged(devices)
  }
}
