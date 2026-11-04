import Foundation

/// Stands in for the SDK: records what the hub asks, and replays the events a test hands it.
final class FakeTargetPort: TargetPort {
  private let atStart: [(String, TargetDevice?, String?)]
  var known: [TargetDevice]
  // Kept after stop, so a test can play a stale port talking to the hub.
  var events: TargetPortEvents?
  var starts = 0
  var stopped = false
  var discovering = false
  var connects: [TargetDevice] = []
  var disconnects: [Bool] = []

  init(atStart: [(String, TargetDevice?, String?)] = [], known: [TargetDevice] = []) {
    self.atStart = atStart
    self.known = known
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

  func startDiscovery() { discovering = true }

  func stopDiscovery() { discovering = false }

  func connect(_ device: TargetDevice) { connects.append(device) }

  func disconnect(stopPlayback: Bool) { disconnects.append(stopPlayback) }

  func emit(_ event: String, _ device: TargetDevice?, error: String? = nil) {
    events?.sessionEvent(event, device: device, error: error)
  }

  func discover(_ devices: [TargetDevice]) {
    known = devices
    events?.devicesChanged(devices)
  }
}
