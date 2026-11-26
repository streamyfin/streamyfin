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
  // What the output sheet reads of the receiver through a suspension, which drops the media client.
  private var heardStatus = LastHeardStatus<GCKMediaStatus>()
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
      "onRemoteTargetChanged", "onOutputPickerAction", "onOutputPickerDismissed"
    )

    OnCreate { [weak self] in
      // The output sheet outlives a JS reload like the hub; it reaches JS through the module in place.
      let presenter = OutputPickerPresenter.shared
      presenter.receiverTitle = {
        guard let status = self?.heardMediaStatus() else { return nil }
        return CastMapping.playingTitle(
          status.playerState.rawValue, title: status.mediaInformation?.metadata?.string(forKey: kGCKMetadataKeyTitle)
        )
      }
      presenter.receiverPlaying = {
        CastMapping.isPlaying(self?.heardMediaStatus()?.playerState.rawValue ?? 0)
      }
      presenter.onDismissed = { self?.sendEvent("onOutputPickerDismissed", [:]) }
    }

    OnDestroy {
      DispatchQueue.main.async { OutputPickerPresenter.shared.dismiss() }
    }

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

    // The output sheet (Cast receivers, AirPlay, this device): true once on screen, false where it cannot show.
    AsyncFunction("presentOutputPicker") { (options: [String: Any]) -> Bool in
      self.ensureListening()
      let presenter = OutputPickerPresenter.shared
      let strings = (options["strings"] as? [String: Any] ?? [:]).compactMapValues { $0 as? String }
      presenter.strings = OutputPickerStrings(strings)
      // The button's own view, which the popover follows across a rotation; its frame is the fallback.
      let anchorView = (options["anchorTag"] as? NSNumber).flatMap {
        self.appContext?.findView(withTag: $0.intValue, ofType: UIView.self)
      }
      // Held by the presenter only while the sheet is up.
      return presenter.present(
        anchor: Self.anchorRect(options["anchor"]), anchorView: anchorView, playingHere: options["playingHere"] as? String
      ) {
        self.sendEvent("onOutputPickerAction", ["action": "remote"])
      }
    }.runOnQueue(.main)

    AsyncFunction("dismissOutputPicker") {
      OutputPickerPresenter.shared.dismiss()
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
    var payload: [String: Any?] = [
      "event": event,
      "sessionId": session.sessionID,
      "error": CastMapping.sessionEndError(error),
    ]
    // A disconnect without stop ends without an error too, and may leave the TV playing: the stop reporter
    // checks the receiver for it instead of taking the end for a closed receiver.
    if event == "ended" && remoteTargets.disconnectedWithoutStop { payload["withoutStop"] = true }
    sendEvent("onSessionEvent", payload)
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

  fileprivate func suspended() {
    // Before the client goes: the sheet keeps what the receiver plays until it reports again.
    heardStatus.hold(observedClient?.mediaStatus)
    stopObserving()
  }

  fileprivate func forgetHeardStatus() {
    heardStatus.forget()
  }

  private func heardMediaStatus() -> GCKMediaStatus? {
    heardStatus.read(observedClient?.mediaStatus)
  }

  fileprivate func sessionEnded() {
    heardStatus.forget()
    stopObserving()
    // The JS side opens its channels again on the next session's first command.
    jsChannels.values.forEach { $0.subscription.remove() }
    jsChannels.removeAll()
    updateSession(nil)
  }

  fileprivate func emitMediaStatus(_ status: GCKMediaStatus?) {
    heardStatus.forget()
    sendEvent("onMediaStatusChanged", ["status": CastRecords.mediaStatus(status)])
    OutputPickerPresenter.shared.refresh()
  }

  /// The button's frame in window points, as JS measures it.
  private static func anchorRect(_ anchor: Any?) -> CGRect? {
    guard let frame = anchor as? [String: Any],
      let x = (frame["x"] as? NSNumber)?.doubleValue, let y = (frame["y"] as? NSNumber)?.doubleValue,
      let width = (frame["width"] as? NSNumber)?.doubleValue, let height = (frame["height"] as? NSNumber)?.doubleValue
    else { return nil }
    return CGRect(x: x, y: y, width: width, height: height)
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
    module?.forgetHeardStatus()
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
    module?.suspended()
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
      "onRemoteTargetChanged", "onOutputPickerAction", "onOutputPickerDismissed"
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
    // No sheet on a TV or a Mac: the JS side keeps its button hidden there.
    AsyncFunction("presentOutputPicker") { (_: [String: Any]) -> Bool in false }
    AsyncFunction("dismissOutputPicker") {}

    View(CastButtonView.self) {
      Prop("tintColor") { (view: CastButtonView, color: String?) in
        view.setTintColor(color)
      }
    }
  }
}
#endif
