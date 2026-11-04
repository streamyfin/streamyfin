import ExpoModulesCore

#if os(iOS) && !targetEnvironment(macCatalyst)
import GoogleCast

/// The Cast SDK, owned by the module: context, discovery, session, custom channels and the
/// media status, published to JS as the events and records of Cast.types.ts. SDK calls run
/// on the main thread; the synchronous getters answer from caches the listeners keep current.
public class CastModule: Module {
  private var listener: CastListener?
  // The hub holds the SDK channel of each namespace and its listeners weakly: the module keeps the
  // relay of what JS asked to hear, so that a session end lets go of exactly that.
  private let hub = ReceiverChannelHub.shared
  private var jsChannels: [String: (relay: ReceiverRelay, subscription: ReceiverSubscription)] = [:]
  // The caches are written on the main thread and read by the synchronous getters from
  // the JS thread; Swift collections are not safe to read while they are replaced.
  private let cacheLock = NSLock()
  private var cachedState: String?
  private var cachedSession: [String: Any?]?
  private var observedClient: GCKRemoteMediaClient?
  // The target hub outlives the module, like the channel hub: it holds the port, the devices and the
  // target state, and holds the module's relay weakly.
  private let remoteTargets = RemoteTargetHub.shared
  private var targetRelay: TargetRelay?

  private func cached<T>(_ read: () -> T) -> T {
    cacheLock.lock()
    defer { cacheLock.unlock() }
    return read()
  }

  public func definition() -> ModuleDefinition {
    Name("StreamyfinCast")

    Events(
      "onCastStateChanged", "onDevicesChanged", "onSessionEvent", "onMediaStatusChanged", "onReceiverMessage",
      "onRemoteTargetChanged"
    )

    OnStartObserving {
      DispatchQueue.main.async { self.ensureListening() }
    }

    Function("isAvailable") { true }

    Function("getCastState") { () -> String? in
      if self.listener == nil { DispatchQueue.main.async { self.ensureListening() } }
      return self.cached { self.cachedState }
    }

    // Play Services are an Android thing; the screens treat "nothing to report" as fine.
    Function("getPlayServicesState") { () -> String? in nil }

    AsyncFunction("showPlayServicesErrorDialog") { (_: String) in }

    Function("getDevices") { self.remoteTargets.devices.map { $0.toDictionary() } }

    AsyncFunction("startDiscovery") {
      self.ensureListening()
      self.remoteTargets.startDiscovery(owner: RemoteTargetHub.appDiscovery)
    }.runOnQueue(.main)

    AsyncFunction("stopDiscovery") {
      self.remoteTargets.stopDiscovery(owner: RemoteTargetHub.appDiscovery)
    }.runOnQueue(.main)

    Function("getRemoteTarget") { () -> [String: Any?] in
      if self.listener == nil { DispatchQueue.main.async { self.ensureListening() } }
      return self.remoteTargets.snapshot.toDictionary()
    }

    // False when discovery does not know the device; the state then follows the session events.
    AsyncFunction("connectToDevice") { (deviceId: String) -> Bool in
      self.ensureListening()
      return self.remoteTargets.connect(deviceId: deviceId)
    }.runOnQueue(.main)

    AsyncFunction("disconnect") { (stopPlayback: Bool) in
      self.ensureListening()
      self.remoteTargets.disconnect(stopPlayback: stopPlayback)
    }.runOnQueue(.main)

    // Only for a connected receiver; the state follows what the SDK reports back.
    AsyncFunction("setTargetVolume") { (level: Double) in
      self.ensureListening()
      self.remoteTargets.setVolume(level)
    }.runOnQueue(.main)

    AsyncFunction("setTargetMuted") { (muted: Bool) in
      self.ensureListening()
      self.remoteTargets.setMuted(muted)
    }.runOnQueue(.main)

    Function("getCurrentSession") { () -> [String: Any?]? in
      if self.listener == nil { DispatchQueue.main.async { self.ensureListening() } }
      return self.cached { self.cachedSession }
    }

    AsyncFunction("showCastDialog") { () -> Bool in
      self.ensureListening()
      GCKCastContext.sharedInstance().presentCastDialog()
      return true
    }.runOnQueue(.main)

    AsyncFunction("showExpandedControls") { () -> Bool in
      self.ensureListening()
      GCKCastContext.sharedInstance().presentDefaultExpandedMediaControls()
      return true
    }.runOnQueue(.main)

    // The hub adds the namespace's channel to every session it is given, a resume included, so
    // the relay hears the receiver from the next session on as well.
    AsyncFunction("addChannel") { (namespace: String) -> [String: Any] in
      self.ensureListening()
      if self.jsChannels[namespace] == nil {
        let relay = ReceiverRelay { [weak self] raw in self?.emitReceiverMessage(namespace, raw) }
        self.jsChannels[namespace] = (relay, self.hub.subscribe(namespace: namespace, listener: relay))
      }
      return ["namespace": namespace, "connected": self.hub.isReady(namespace: namespace)]
    }.runOnQueue(.main)

    AsyncFunction("removeChannel") { (namespace: String) in
      // Only JS stops hearing: the engine may still listen on the same channel.
      self.jsChannels.removeValue(forKey: namespace)?.subscription.remove()
    }.runOnQueue(.main)

    AsyncFunction("sendMessage") { (namespace: String, message: String, promise: Promise) in
      guard self.jsChannels[namespace] != nil else {
        promise.reject("ERR_CAST_NO_CHANNEL", "No channel open for \(namespace)")
        return
      }
      self.hub.send(namespace: namespace, text: message) { error in
        if let error {
          promise.reject("ERR_CAST_SEND", error)
        } else {
          promise.resolve(nil)
        }
      }
    }.runOnQueue(.main)

    // Each transport call names the session JS meant it for: the current one may have
    // changed between the JS check and this main-queue run.
    AsyncFunction("getMediaStatus") { (sessionId: String?) -> [String: Any?]? in
      CastRecords.mediaStatus(self.ownSession(sessionId)?.remoteMediaClient?.mediaStatus)
    }.runOnQueue(.main)

    AsyncFunction("play") { (sessionId: String?) in self.ownSession(sessionId)?.remoteMediaClient?.play() }.runOnQueue(.main)
    AsyncFunction("pause") { (sessionId: String?) in self.ownSession(sessionId)?.remoteMediaClient?.pause() }.runOnQueue(.main)
    AsyncFunction("stop") { (sessionId: String?) in self.ownSession(sessionId)?.remoteMediaClient?.stop() }.runOnQueue(.main)
    AsyncFunction("seek") { (positionSeconds: Double, sessionId: String?) in
      let options = GCKMediaSeekOptions()
      options.interval = positionSeconds
      self.ownSession(sessionId)?.remoteMediaClient?.seek(with: options)
    }.runOnQueue(.main)

    View(CastButtonView.self) {
      Prop("tintColor") { (view: CastButtonView, color: String?) in
        view.setTintColor(color)
      }
    }
  }

  // Main thread only: the SDK expects it, and the caches are written here alone.
  private func ensureListening() {
    CastContextBootstrap.initializeIfNeeded()
    guard listener == nil else { return }
    let context = GCKCastContext.sharedInstance()
    // Before the module's own listener and before a present session is announced: whatever JS
    // sends on hearing of a session finds the hub attached to it.
    GoogleCastChannelBinding.install()
    let listener = CastListener(module: self)
    self.listener = listener
    // Relayed before the port is installed: a session the port finds running reaches JS as connected.
    let relay = TargetRelay(module: self)
    targetRelay = relay
    _ = remoteTargets.addListener(relay)
    RemoteTargets.installDefault()
    context.sessionManager.add(listener)
    NotificationCenter.default.addObserver(
      listener, selector: #selector(CastListener.castStateDidChange), name: .gckCastStateDidChange, object: nil
    )
    updateState(Int(context.castState.rawValue))
    if let session = context.sessionManager.currentCastSession {
      observe(session)
      updateSession(session)
      // A session resumed by the SDK before JS listened (a relaunch) is announced like a
      // resume, or the hooks would never see it.
      emitSession("resumed", session, error: nil)
    }
  }

  private func currentSession() -> GCKCastSession? {
    ensureListening()
    return GCKCastContext.sharedInstance().sessionManager.currentCastSession
  }

  private func ownSession(_ sessionId: String?) -> GCKCastSession? {
    guard let session = currentSession() else { return nil }
    if let sessionId, session.sessionID != sessionId { return nil }
    return session
  }

  fileprivate func updateState(_ rawValue: Int) {
    guard let name = CastMapping.castStateName(rawValue), name != cached({ cachedState }) else { return }
    cached { cachedState = name }
    sendEvent("onCastStateChanged", ["state": name])
  }

  fileprivate func emitDevices(_ devices: [TargetDevice]) {
    sendEvent("onDevicesChanged", ["devices": devices.map { $0.toDictionary() }])
  }

  fileprivate func emitRemoteTarget(_ snapshot: RemoteTargetSnapshot) {
    sendEvent("onRemoteTargetChanged", snapshot.toDictionary())
  }

  fileprivate func updateSession(_ session: GCKCastSession?) {
    let record = CastRecords.session(session)
    cached { cachedSession = record }
  }

  fileprivate func emitSession(_ event: String, _ session: GCKSession, error: Error?) {
    sendEvent("onSessionEvent", [
      "event": event,
      "sessionId": session.sessionID,
      "error": CastMapping.sessionEndError(error),
    ])
  }

  fileprivate func observe(_ session: GCKCastSession) {
    guard let client = session.remoteMediaClient, client !== observedClient, let listener else { return }
    observedClient?.remove(listener)
    client.add(listener)
    observedClient = client
  }

  fileprivate func stopObserving() {
    if let listener { observedClient?.remove(listener) }
    observedClient = nil
  }

  fileprivate func sessionEnded() {
    stopObserving()
    // The JS side opens its channels again on the next session's first command.
    jsChannels.values.forEach { $0.subscription.remove() }
    jsChannels.removeAll()
    updateSession(nil)
  }

  fileprivate func emitMediaStatus(_ status: GCKMediaStatus?) {
    sendEvent("onMediaStatusChanged", ["status": CastRecords.mediaStatus(status)])
  }

  fileprivate func emitReceiverMessage(_ namespace: String, _ message: String) {
    sendEvent("onReceiverMessage", ["namespace": namespace, "message": message])
  }
}

/// What JS hears of the target and the devices, held by the module: the target hub holds its listeners weakly.
private final class TargetRelay: RemoteTargetListener {
  private weak var module: CastModule?

  init(module: CastModule) {
    self.module = module
  }

  func remoteTargetDidChange(_ snapshot: RemoteTargetSnapshot) {
    module?.emitRemoteTarget(snapshot)
  }

  func remoteTargetDevicesDidChange(_ devices: [TargetDevice]) {
    module?.emitDevices(devices)
  }
}

/// What JS hears of the receiver, held by the module: the hub holds its listeners weakly.
private final class ReceiverRelay: ReceiverBusListener {
  private let onMessage: (String) -> Void

  init(onMessage: @escaping (String) -> Void) {
    self.onMessage = onMessage
  }

  func receiverBusDidReceive(_ raw: String) {
    onMessage(raw)
  }

  func receiverBusDidBecomeReady(sessionId: String) {}

  func receiverBusDidLose(sessionId: String?, ended: Bool) {}
}

/// The SDK delegates, in one object the module owns; every callback lands on the main thread. The
/// device list comes through the target hub's port.
private class CastListener: NSObject, GCKSessionManagerListener, GCKRemoteMediaClientListener {
  private weak var module: CastModule?

  init(module: CastModule) {
    self.module = module
  }

  @objc func castStateDidChange() {
    module?.updateState(Int(GCKCastContext.sharedInstance().castState.rawValue))
  }

  func sessionManager(_ sessionManager: GCKSessionManager, willStart session: GCKSession) {
    module?.emitSession("starting", session, error: nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didStart session: GCKSession) {
    if let cast = session as? GCKCastSession {
      module?.observe(cast)
      module?.updateSession(cast)
    }
    module?.emitSession("started", session, error: nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didFailToStart session: GCKSession, withError error: Error) {
    module?.emitSession("startFailed", session, error: error)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didSuspend session: GCKSession, with reason: GCKConnectionSuspendReason) {
    module?.stopObserving()
    module?.emitSession("suspended", session, error: nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, willResumeSession session: GCKSession) {
    module?.emitSession("resuming", session, error: nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didResumeSession session: GCKSession) {
    if let cast = session as? GCKCastSession {
      module?.observe(cast)
      module?.updateSession(cast)
    }
    module?.emitSession("resumed", session, error: nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, willEnd session: GCKSession) {
    module?.emitSession("ending", session, error: nil)
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didEnd session: GCKSession, withError error: Error?) {
    module?.sessionEnded()
    module?.emitSession("ended", session, error: error)
  }

  func remoteMediaClient(_ client: GCKRemoteMediaClient, didUpdate mediaStatus: GCKMediaStatus?) {
    module?.emitMediaStatus(mediaStatus)
  }
}
#else
/// tvOS and Catalyst carry no Cast: the module answers unavailable and the JS side does nothing.
public class CastModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StreamyfinCast")

    Events(
      "onCastStateChanged", "onDevicesChanged", "onSessionEvent", "onMediaStatusChanged", "onReceiverMessage",
      "onRemoteTargetChanged"
    )

    Function("isAvailable") { false }
    Function("getCastState") { () -> String? in nil }
    Function("getPlayServicesState") { () -> String? in nil }
    Function("getDevices") { [[String: Any]]() }
    Function("getCurrentSession") { () -> [String: Any]? in nil }
    Function("getRemoteTarget") { () -> [String: Any?] in RemoteTargetSnapshot.none.toDictionary() }
    AsyncFunction("connectToDevice") { (_: String) -> Bool in false }
    AsyncFunction("disconnect") { (_: Bool) in }
    AsyncFunction("setTargetVolume") { (_: Double) in }
    AsyncFunction("setTargetMuted") { (_: Bool) in }

    View(CastButtonView.self) {
      Prop("tintColor") { (view: CastButtonView, color: String?) in
        view.setTintColor(color)
      }
    }
  }
}
#endif
