import ExpoModulesCore

#if os(iOS) && !targetEnvironment(macCatalyst)
import GoogleCast

/// The Cast SDK, owned by the module: context, discovery, session, custom channels and the
/// media status, published to JS as the events and records of Cast.types.ts. SDK calls run
/// on the main thread; the synchronous getters answer from caches the listeners keep current.
public class CastModule: Module {
  private var listener: CastListener?
  private var channels: [String: GCKGenericChannel] = [:]
  private var cachedState: String?
  private var cachedDevices: [[String: Any?]] = []
  private var cachedSession: [String: Any?]?
  private var observedClient: GCKRemoteMediaClient?

  public func definition() -> ModuleDefinition {
    Name("StreamyfinCast")

    Events("onCastStateChanged", "onDevicesChanged", "onSessionEvent", "onMediaStatusChanged", "onReceiverMessage")

    OnStartObserving {
      DispatchQueue.main.async { self.ensureListening() }
    }

    Function("isAvailable") { true }

    Function("getCastState") { () -> String? in
      if self.listener == nil { DispatchQueue.main.async { self.ensureListening() } }
      return self.cachedState
    }

    // Play Services are an Android thing; the screens treat "nothing to report" as fine.
    Function("getPlayServicesState") { () -> String? in nil }

    AsyncFunction("showPlayServicesErrorDialog") { (_: String) in }

    Function("getDevices") { self.cachedDevices }

    AsyncFunction("startDiscovery") {
      self.ensureListening()
      GCKCastContext.sharedInstance().discoveryManager.startDiscovery()
    }.runOnQueue(.main)

    AsyncFunction("stopDiscovery") {
      GCKCastContext.sharedInstance().discoveryManager.stopDiscovery()
    }.runOnQueue(.main)

    Function("getCurrentSession") { () -> [String: Any?]? in
      if self.listener == nil { DispatchQueue.main.async { self.ensureListening() } }
      return self.cachedSession
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

    AsyncFunction("addChannel") { (namespace: String) -> [String: Any] in
      guard let session = self.currentSession() else {
        return ["namespace": namespace, "connected": false]
      }
      let channel = self.channels[namespace] ?? {
        let created = GCKGenericChannel(namespace: namespace)
        created.delegate = self.listener
        session.add(created)
        self.channels[namespace] = created
        return created
      }()
      return ["namespace": namespace, "connected": channel.isConnected]
    }.runOnQueue(.main)

    AsyncFunction("removeChannel") { (namespace: String) in
      guard let channel = self.channels.removeValue(forKey: namespace) else { return }
      // The session may be gone already; the channel went with it.
      self.currentSession()?.remove(channel)
    }.runOnQueue(.main)

    AsyncFunction("sendMessage") { (namespace: String, message: String, promise: Promise) in
      guard let channel = self.channels[namespace] else {
        promise.reject("ERR_CAST_NO_CHANNEL", "No channel open for \(namespace)")
        return
      }
      var error: GCKError?
      if channel.sendTextMessage(message, error: &error) {
        promise.resolve(nil)
      } else {
        promise.reject("ERR_CAST_SEND", error?.localizedDescription ?? "The receiver did not take the message")
      }
    }.runOnQueue(.main)

    AsyncFunction("getMediaStatus") { () -> [String: Any?]? in
      CastRecords.mediaStatus(self.currentSession()?.remoteMediaClient?.mediaStatus)
    }.runOnQueue(.main)

    AsyncFunction("play") { self.currentSession()?.remoteMediaClient?.play() }.runOnQueue(.main)
    AsyncFunction("pause") { self.currentSession()?.remoteMediaClient?.pause() }.runOnQueue(.main)
    AsyncFunction("stop") { self.currentSession()?.remoteMediaClient?.stop() }.runOnQueue(.main)
    AsyncFunction("seek") { (positionSeconds: Double) in
      let options = GCKMediaSeekOptions()
      options.interval = positionSeconds
      self.currentSession()?.remoteMediaClient?.seek(with: options)
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
    let listener = CastListener(module: self)
    self.listener = listener
    context.sessionManager.add(listener)
    context.discoveryManager.add(listener)
    NotificationCenter.default.addObserver(
      listener, selector: #selector(CastListener.castStateDidChange), name: .gckCastStateDidChange, object: nil
    )
    updateState(Int(context.castState.rawValue))
    updateDevices()
    if let session = context.sessionManager.currentCastSession {
      observe(session)
      updateSession(session)
    }
  }

  private func currentSession() -> GCKCastSession? {
    ensureListening()
    return GCKCastContext.sharedInstance().sessionManager.currentCastSession
  }

  fileprivate func updateState(_ rawValue: Int) {
    guard let name = CastMapping.castStateName(rawValue), name != cachedState else { return }
    cachedState = name
    sendEvent("onCastStateChanged", ["state": name])
  }

  fileprivate func updateDevices() {
    let manager = GCKCastContext.sharedInstance().discoveryManager
    let devices = (0..<manager.deviceCount).compactMap { CastRecords.device(manager.device(at: $0)) }
    cachedDevices = devices
    sendEvent("onDevicesChanged", ["devices": devices])
  }

  fileprivate func updateSession(_ session: GCKCastSession?) {
    cachedSession = CastRecords.session(session)
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
    // The channels died with the session; the JS side opens new ones on the next command.
    channels.removeAll()
    updateSession(nil)
  }

  fileprivate func emitMediaStatus(_ status: GCKMediaStatus?) {
    sendEvent("onMediaStatusChanged", ["status": CastRecords.mediaStatus(status)])
  }

  fileprivate func emitReceiverMessage(_ namespace: String, _ message: String) {
    sendEvent("onReceiverMessage", ["namespace": namespace, "message": message])
  }
}

/// The SDK delegates, in one object the module owns; every callback lands on the main thread.
private class CastListener: NSObject, GCKSessionManagerListener, GCKDiscoveryManagerListener,
  GCKRemoteMediaClientListener, GCKGenericChannelDelegate
{
  private weak var module: CastModule?

  init(module: CastModule) {
    self.module = module
  }

  @objc func castStateDidChange() {
    module?.updateState(Int(GCKCastContext.sharedInstance().castState.rawValue))
  }

  func didUpdateDeviceList() {
    module?.updateDevices()
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

  func cast(_ channel: GCKGenericChannel, didReceiveTextMessage message: String, withNamespace protocolNamespace: String) {
    module?.emitReceiverMessage(protocolNamespace, message)
  }
}
#else
/// tvOS and Catalyst carry no Cast: the module answers unavailable and the JS side does nothing.
public class CastModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StreamyfinCast")

    Events("onCastStateChanged", "onDevicesChanged", "onSessionEvent", "onMediaStatusChanged", "onReceiverMessage")

    Function("isAvailable") { false }
    Function("getCastState") { () -> String? in nil }
    Function("getPlayServicesState") { () -> String? in nil }
    Function("getDevices") { [[String: Any]]() }
    Function("getCurrentSession") { () -> [String: Any]? in nil }

    View(CastButtonView.self) {
      Prop("tintColor") { (view: CastButtonView, color: String?) in
        view.setTintColor(color)
      }
    }
  }
}
#endif
