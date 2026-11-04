import Foundation

/// A Cast receiver as the port uses it: the device it reaches, and how to start a session on it.
struct CastTargetRoute {
  let device: TargetDevice
  /// False when the SDK would not start the session.
  let startSession: () -> Bool
}

/// The SDK's current session when the port starts: connected, or still connecting.
struct RunningTargetSession {
  let device: TargetDevice?
  let connected: Bool
}

/// The Cast SDK as the hub sees it. The SDK calls come in as closures so that the standalone check
/// can stand in for the discovery and session managers, and `make()` wires the real ones. Like the
/// module before it, the port hears the SDK's device list from the start, discovery or not. Main
/// thread only.
final class GoogleCastTargetPort: TargetPort {
  static let receiverGone = "The receiver is no longer on the network"
  static let startRefused = "The Cast SDK did not start the session"
  static let endRefused = "The Cast SDK did not end the session a switch had to end"
  static let disconnectRefused = "The Cast SDK did not end the session"

  private let routes: () -> [CastTargetRoute]
  private let runningSession: () -> RunningTargetSession?
  /// Answers the SDK's endSessionAndStopCasting: false when it kept the session.
  private let endSession: (_ stopPlayback: Bool) -> Bool
  private let watchSessions: (((String, TargetDevice?, String?) -> Void)?) -> Void
  private let watchDevices: ((() -> Void)?) -> Void
  private let discovery: (_ on: Bool) -> Void
  private var events: TargetPortEvents?
  private var discovering = false
  // The receiver a switch is waiting to start, once the SDK reports the end of the session before it.
  private var pendingSwitch: TargetDevice?

  init(
    routes: @escaping () -> [CastTargetRoute],
    runningSession: @escaping () -> RunningTargetSession?,
    endSession: @escaping (_ stopPlayback: Bool) -> Bool,
    watchSessions: @escaping (((String, TargetDevice?, String?) -> Void)?) -> Void,
    watchDevices: @escaping ((() -> Void)?) -> Void,
    discovery: @escaping (_ on: Bool) -> Void
  ) {
    self.routes = routes
    self.runningSession = runningSession
    self.endSession = endSession
    self.watchSessions = watchSessions
    self.watchDevices = watchDevices
    self.discovery = discovery
  }

  func start(events: TargetPortEvents) {
    self.events = events
    watchSessions { [weak self] event, device, error in self?.sessionChanged(event, device: device, error: error) }
    watchDevices { [weak self] in self?.reportDevices() }
    reportDevices()
    // A session that was there before the port (a JS reload, the SDK's own reconnection at launch).
    if let session = runningSession() {
      events.sessionEvent(session.connected ? "resumed" : "resuming", device: session.device, error: nil)
    }
  }

  func stop() {
    pendingSwitch = nil
    stopDiscovery()
    watchSessions(nil)
    watchDevices(nil)
    events = nil
  }

  func devices() -> [TargetDevice] {
    routes().map(\.device)
  }

  func startDiscovery() {
    guard !discovering else { return }
    discovering = true
    discovery(true)
  }

  func stopDiscovery() {
    guard discovering else { return }
    discovering = false
    discovery(false)
  }

  func connect(_ device: TargetDevice) {
    let switching = pendingSwitch != nil
    pendingSwitch = nil
    if let running = runningSession() {
      if running.device?.id == device.id {
        // Asked back while a switch ends its session: start it again once that end comes.
        if switching { pendingSwitch = device }
        // Otherwise that receiver's session is already there, or on its way.
        return
      }
      // The end a switch asked for is under way: only the receiver that starts after it changes.
      if switching {
        pendingSwitch = device
        return
      }
      // The SDK starts no session while one is established (GCKSessionManager.startSession(with:)
      // answers NO): end it, and start this receiver once the SDK reports the end.
      pendingSwitch = device
      if !endSession(true) {
        // The SDK kept the session it was asked to end: this receiver cannot start.
        pendingSwitch = nil
        events?.sessionEvent("startFailed", device: device, error: Self.endRefused)
      }
      return
    }
    startSession(on: device)
  }

  func disconnect(stopPlayback: Bool) {
    pendingSwitch = nil
    if let running = runningSession() {
      // The SDK kept the session: it stays, and the state says why.
      if !endSession(stopPlayback) {
        events?.sessionEvent("endRefused", device: running.device, error: Self.disconnectRefused)
      }
      return
    }
    // Asked before the SDK started a session: nothing would end, so the request ends here.
    events?.sessionEvent("ended", device: nil, error: nil)
  }

  private func startSession(on device: TargetDevice) {
    guard let route = routes().first(where: { $0.device.id == device.id }) else {
      events?.sessionEvent("startFailed", device: device, error: Self.receiverGone)
      return
    }
    if !route.startSession() {
      events?.sessionEvent("startFailed", device: device, error: Self.startRefused)
    }
  }

  private func sessionChanged(_ event: String, device: TargetDevice?, error: String?) {
    events?.sessionEvent(event, device: device, error: error)
    // The session a switch ended is gone: the receiver asked for meanwhile can start now.
    guard event == "ended" || event == "startFailed", let next = pendingSwitch else { return }
    pendingSwitch = nil
    startSession(on: next)
  }

  private func reportDevices() {
    events?.devicesChanged(devices())
  }
}

#if os(iOS) && !targetEnvironment(macCatalyst)
import GoogleCast

extension GoogleCastTargetPort {
  static func targetDevice(_ device: GCKDevice?) -> TargetDevice? {
    guard let device else { return nil }
    return TargetDevice(id: device.deviceID, name: device.friendlyName ?? "", model: device.modelName)
  }

  /// The shared context's discovery and session managers. The SDK holds its listeners weakly: the
  /// closures keep them.
  static func make() -> GoogleCastTargetPort {
    let context = GCKCastContext.sharedInstance()
    let discoveryManager = context.discoveryManager
    let sessionManager = context.sessionManager
    var sessionListener: TargetSessionListener?
    var deviceListener: TargetDeviceListener?
    return GoogleCastTargetPort(
      routes: {
        (0..<discoveryManager.deviceCount).compactMap { index in
          let receiver = discoveryManager.device(at: index)
          guard let device = targetDevice(receiver) else { return nil }
          return CastTargetRoute(device: device) { sessionManager.startSession(with: receiver) }
        }
      },
      runningSession: {
        guard let session = sessionManager.currentCastSession else { return nil }
        return RunningTargetSession(device: targetDevice(session.device), connected: session.connectionState == .connected)
      },
      endSession: { stopPlayback in sessionManager.endSessionAndStopCasting(stopPlayback) },
      watchSessions: { relay in
        if let sessionListener { sessionManager.remove(sessionListener) }
        sessionListener = relay.map(TargetSessionListener.init)
        if let sessionListener { sessionManager.add(sessionListener) }
      },
      watchDevices: { onChange in
        if let deviceListener { discoveryManager.remove(deviceListener) }
        deviceListener = onChange.map(TargetDeviceListener.init)
        if let deviceListener { discoveryManager.add(deviceListener) }
      },
      discovery: { on in on ? discoveryManager.startDiscovery() : discoveryManager.stopDiscovery() }
    )
  }
}

/// Gives the shared hub its port, once per process: every module instance and the debug probe come through here.
enum RemoteTargets {
  private static var installed = false

  static func installDefault(hub: RemoteTargetHub = .shared) {
    guard !installed else { return }
    installed = true
    hub.install(GoogleCastTargetPort.make())
  }
}

#if DEBUG
extension CastTargetProbe {
  private static var current: CastTargetProbe?

  /// One probe at a time, on the app's hub, its timers on the main queue. Debug builds log through
  /// Logger, which prints each line with its type: the console reads [CastTargetProbe]. `then` names a
  /// second receiver, asked once the first one is connected: a switch inside one process, where every
  /// relaunch would first meet the SDK resuming its session.
  static func run(deviceName: String, keep: Bool, holdMs: Double, then next: String? = nil, back: Bool = false) {
    let log: (String) -> Void = { Logger.shared.log($0, type: "CastTargetProbe") }
    if current?.isActive == true { return log("already running") }
    RemoteTargets.installDefault()
    let first = CastTargetProbe.firstOfChain(keep: keep, then: next, back: back)
    let probe = CastTargetProbe(
      hub: .shared, deviceName: deviceName, keep: first.keep, holdMs: holdMs, back: first.back,
      schedule: { delayMs, run in
        let work = DispatchWorkItem(block: run)
        DispatchQueue.main.asyncAfter(deadline: .now() + delayMs / 1000, execute: work)
        return { work.cancel() }
      },
      log: log
    )
    if let next, !next.isEmpty {
      probe.onFinish = { result in
        guard result.hasPrefix("done") else { return }
        DispatchQueue.main.async { run(deviceName: next, keep: true, holdMs: holdMs, back: back) }
      }
    }
    current = probe
    probe.start()
  }
}
#endif

/// The same event names and errors as the module's own listener, which onSessionEvent publishes.
private final class TargetSessionListener: NSObject, GCKSessionManagerListener {
  private let report: (String, TargetDevice?, String?) -> Void

  init(report: @escaping (String, TargetDevice?, String?) -> Void) {
    self.report = report
  }

  private func device(_ session: GCKSession) -> TargetDevice? {
    GoogleCastTargetPort.targetDevice(session.device)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, willStart session: GCKSession) {
    report("starting", device(session), nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didStart session: GCKSession) {
    report("started", device(session), nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didFailToStart session: GCKSession, withError error: Error) {
    report("startFailed", device(session), CastMapping.sessionEndError(error))
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didSuspend session: GCKSession, with reason: GCKConnectionSuspendReason) {
    report("suspended", device(session), nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, willResumeSession session: GCKSession) {
    report("resuming", device(session), nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didResumeSession session: GCKSession) {
    report("resumed", device(session), nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, willEnd session: GCKSession) {
    report("ending", device(session), nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didEnd session: GCKSession, withError error: Error?) {
    report("ended", device(session), CastMapping.sessionEndError(error))
  }
}

private final class TargetDeviceListener: NSObject, GCKDiscoveryManagerListener {
  private let onChange: () -> Void

  init(onChange: @escaping () -> Void) {
    self.onChange = onChange
  }

  func didUpdateDeviceList() {
    onChange()
  }
}
#endif
