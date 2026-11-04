import Foundation

/// Two receivers that exist only in a tier 1 build (e2e/README.md, "Fake Cast receivers"): they connect
/// and end on timers, through the states a real receiver walks the hub through, so the flows that pick
/// a target run without one. RemoteTargets installs them only when the build asked for them.
final class FakeCastDevices: TargetPort {
  static let notOnTheBench = "Not one of the fake receivers"
  static let devices = [
    TargetDevice(id: "fake-cast-living-room", name: "Bench TV", model: "Fake Chromecast"),
    TargetDevice(id: "fake-cast-bedroom", name: "Bench Speaker", model: "Fake Cast speaker"),
  ]

  private let schedule: (Double, @escaping () -> Void) -> (() -> Void)
  private var events: TargetPortEvents?
  private var current: TargetDevice?
  private var pending: (() -> Void)?

  init(schedule: @escaping (Double, @escaping () -> Void) -> (() -> Void)) {
    self.schedule = schedule
  }

  func start(events: TargetPortEvents) {
    self.events = events
  }

  func stop() {
    cancelPending()
    events = nil
  }

  func devices() -> [TargetDevice] { Self.devices }

  func startDiscovery() {
    events?.devicesChanged(Self.devices)
  }

  func stopDiscovery() {}

  func connect(_ device: TargetDevice) {
    guard Self.devices.contains(where: { $0.id == device.id }) else {
      events?.sessionEvent("startFailed", device: device, error: Self.notOnTheBench)
      return
    }
    // Like the SDK, the session on another receiver ends before this one starts.
    if let previous = current {
      cancelPending()
      events?.sessionEvent("ending", device: previous, error: nil)
      events?.sessionEvent("ended", device: previous, error: nil)
    }
    current = device
    events?.sessionEvent("starting", device: device, error: nil)
    pending = schedule(RemoteTargetConstants.fakeConnectDelayMs) { [weak self] in
      self?.pending = nil
      self?.events?.sessionEvent("started", device: device, error: nil)
    }
  }

  func disconnect(stopPlayback: Bool) {
    let device = current
    cancelPending()
    guard let device else {
      events?.sessionEvent("ended", device: nil, error: nil)
      return
    }
    events?.sessionEvent("ending", device: device, error: nil)
    pending = schedule(RemoteTargetConstants.fakeEndDelayMs) { [weak self] in
      self?.pending = nil
      self?.current = nil
      self?.events?.sessionEvent("ended", device: device, error: nil)
    }
  }

  private func cancelPending() {
    pending?()
    pending = nil
  }
}

/// Gives the shared hub its port: the fake receivers in a build that asked for them, the Cast SDK's
/// everywhere else (installDefault, iOS only, in GoogleCastTargetPort.swift).
enum RemoteTargets {
  /// Set by `STREAMYFIN_FAKE_CAST_DEVICES=1` at `pod install` for tier 1 builds (e2e/README.md); no
  /// store build sets it.
  static let fakeDevices: Bool = {
    #if FAKE_CAST_DEVICES
      return true
    #else
      return false
    #endif
  }()

  static func portFor(
    fake: Bool, real: () -> TargetPort, schedule: @escaping (Double, @escaping () -> Void) -> (() -> Void)
  ) -> TargetPort {
    fake ? FakeCastDevices(schedule: schedule) : real()
  }
}
