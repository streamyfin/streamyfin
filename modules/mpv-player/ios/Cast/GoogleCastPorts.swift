import Foundation

#if os(iOS) && !targetEnvironment(macCatalyst)
import GoogleCast

/// One Cast session object's receiver channels, as the hub sees them: a generic channel per
/// namespace, added to this object and gone with it. A resume hands a new object, so a new port.
final class GoogleCastChannelPort: ReceiverChannelPort {
  private weak var session: GCKCastSession?
  let sessionId: String?
  // The channel holds its delegate weakly: the port keeps both for as long as the namespace is registered.
  private var channels: [String: (channel: GCKGenericChannel, delegate: ChannelDelegate)] = [:]

  init(session: GCKCastSession) {
    self.session = session
    sessionId = session.sessionID
  }

  var isConnected: Bool {
    session?.connectionState == .connected
  }

  func register(namespace: String, onMessage: @escaping (String) -> Void, onConnected: @escaping () -> Void) -> Bool {
    guard let session else { return false }
    let delegate = ChannelDelegate(onMessage: onMessage, onConnected: onConnected)
    let channel = GCKGenericChannel(namespace: namespace)
    channel.delegate = delegate
    guard session.add(channel) else { return false }
    channels[namespace] = (channel, delegate)
    return true
  }

  func unregister(namespace: String) {
    guard let entry = channels.removeValue(forKey: namespace) else { return }
    // The session object may be gone already, and its channels with it.
    session?.remove(entry.channel)
  }

  func isChannelConnected(namespace: String) -> Bool {
    channels[namespace]?.channel.isConnected ?? false
  }

  func send(namespace: String, text: String, completion: @escaping (String?) -> Void) {
    guard let channel = channels[namespace]?.channel else {
      completion("No channel open for \(namespace)")
      return
    }
    var error: GCKError?
    completion(channel.sendTextMessage(text, error: &error) ? nil : error?.localizedDescription ?? "The receiver did not take the message")
  }
}

/// A channel's delegate: what the receiver sends, and the moment the channel can carry messages.
private final class ChannelDelegate: NSObject, GCKGenericChannelDelegate {
  private let onMessage: (String) -> Void
  private let onConnected: () -> Void

  init(onMessage: @escaping (String) -> Void, onConnected: @escaping () -> Void) {
    self.onMessage = onMessage
    self.onConnected = onConnected
  }

  func cast(_ channel: GCKGenericChannel, didReceiveTextMessage message: String, withNamespace protocolNamespace: String) {
    onMessage(message)
  }

  func castChannelDidConnect(_ channel: GCKGenericChannel) {
    onConnected()
  }
}

/// Ties the shared hub to the SDK's sessions, once per process. The session manager holds its
/// listeners weakly, so the binding keeps its own for good.
enum GoogleCastChannelBinding {
  private static var listener: SessionListener?

  static func install(hub: ReceiverChannelHub = .shared) {
    guard listener == nil else { return }
    let listener = SessionListener(hub: hub)
    self.listener = listener
    let manager = GCKCastContext.sharedInstance().sessionManager
    manager.add(listener)
    // A session the SDK resumed before the binding (a relaunch).
    if let session = manager.currentCastSession, session.connectionState == .connected {
      hub.attach(GoogleCastChannelPort(session: session))
    }
  }

  // A suspended session is ended on iOS, and its resume is a new object under the same id: each
  // start and resume hands the hub a port of its own.
  private final class SessionListener: NSObject, GCKSessionManagerListener {
    private let hub: ReceiverChannelHub

    init(hub: ReceiverChannelHub) {
      self.hub = hub
    }

    func sessionManager(_ sessionManager: GCKSessionManager, didStart session: GCKSession) {
      if let cast = session as? GCKCastSession { hub.attach(GoogleCastChannelPort(session: cast)) }
    }

    func sessionManager(_ sessionManager: GCKSessionManager, didResumeSession session: GCKSession) {
      if let cast = session as? GCKCastSession { hub.attach(GoogleCastChannelPort(session: cast)) }
    }

    func sessionManager(_ sessionManager: GCKSessionManager, didSuspend session: GCKSession, with reason: GCKConnectionSuspendReason) {
      hub.suspend()
    }

    func sessionManager(_ sessionManager: GCKSessionManager, didEnd session: GCKSession, withError error: Error?) {
      hub.end()
    }
  }
}

/// The session manager as the engine sees it: the current session, and what happens to sessions. The
/// manager holds its listeners weakly; the engine holds this source.
final class GoogleCastSessionSource: NSObject, CastSessionSource, GCKSessionManagerListener {
  weak var listener: CastSessionListener?
  private let manager = GCKCastContext.sharedInstance().sessionManager

  override init() {
    super.init()
    manager.add(self)
  }

  var current: CastSessionPort? {
    manager.currentCastSession.map { GoogleCastSessionPort(session: $0) }
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didSuspend session: GCKSession, with reason: GCKConnectionSuspendReason) {
    listener?.castSessionDidSuspend(sessionId: session.sessionID)
  }

  // The resumed object is a new one under the same id: it gets a port of its own.
  func sessionManager(_ sessionManager: GCKSessionManager, didResumeSession session: GCKSession) {
    guard let cast = session as? GCKCastSession else { return }
    listener?.castSessionDidResume(GoogleCastSessionPort(session: cast))
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didEnd session: GCKSession, withError error: Error?) {
    listener?.castSessionDidEnd(sessionId: session.sessionID, error: CastMapping.sessionEndError(error))
  }

  func sessionManager(_ sessionManager: GCKSessionManager, didFailToStart session: GCKSession, withError error: Error) {
    listener?.castSessionDidEnd(sessionId: session.sessionID, error: CastMapping.sessionEndError(error))
  }

  func sessionManager(_ sessionManager: GCKSessionManager, session: GCKSession, didReceiveDeviceVolume volume: Float, muted: Bool) {
    listener?.castSessionDidReceiveVolume(Double(volume), muted: muted)
  }
}

final class GoogleCastSessionPort: CastSessionPort {
  private let session: GCKCastSession
  private var mediaPort: GoogleCastMediaPort?

  init(session: GCKCastSession) {
    self.session = session
  }

  var sessionId: String? { session.sessionID }

  var isConnected: Bool { session.connectionState == .connected }

  // A new remote media client gets a new port.
  var media: CastMediaPort? {
    guard let client = session.remoteMediaClient else { return nil }
    if let port = mediaPort, port.client === client { return port }
    let port = GoogleCastMediaPort(client: client)
    mediaPort = port
    return port
  }

  var volume: Double? { Double(session.currentDeviceVolume) }

  func setVolume(_ level: Double) {
    session.setDeviceVolume(Float(level))
  }

  func setMute(_ muted: Bool) {
    session.setDeviceMuted(muted)
  }
}

final class GoogleCastMediaPort: NSObject, CastMediaPort, GCKRemoteMediaClientListener {
  let client: GCKRemoteMediaClient
  private weak var ear: CastMediaListener?
  // A request holds its delegate weakly: the port keeps each until its seek completes.
  private var seeks: [SeekWatcher] = []

  init(client: GCKRemoteMediaClient) {
    self.client = client
  }

  var listener: CastMediaListener? {
    get { ear }
    set {
      let wasListening = ear != nil
      ear = newValue
      if newValue != nil, !wasListening { client.add(self) }
      if newValue == nil, wasListening { client.remove(self) }
    }
  }

  // The receiver writes its customData on the media information, not on the status (spec §3.2).
  var status: CastMediaSnapshot? {
    guard let status = client.mediaStatus else { return nil }
    let info = status.mediaInformation
    let duration = info?.streamDuration ?? 0
    return CastMediaSnapshot(
      playerState: CastMapping.playerStateName(status.playerState.rawValue),
      idleReason: CastMapping.idleReasonName(status.idleReason.rawValue),
      hasMedia: info != nil,
      streamPosition: status.streamPosition,
      playbackRate: Double(status.playbackRate),
      customData: info?.customData as? [String: Any],
      // Live media has an infinite duration.
      streamDuration: duration.isFinite ? duration : 0,
      hasTextTracks: CastMapping.hasTextTracks(info?.mediaTracks?.map { $0.type.rawValue } ?? [])
    )
  }

  var approximatePosition: TimeInterval { client.approximateStreamPosition() }

  func play() {
    client.play()
  }

  func pause() {
    client.pause()
  }

  func seek(to position: TimeInterval, completion: @escaping (Bool) -> Void) {
    let options = GCKMediaSeekOptions()
    options.interval = position
    options.resumeState = .unchanged
    let request = client.seek(with: options)
    let watcher = SeekWatcher { [weak self] watcher, succeeded in
      self?.seeks.removeAll { $0 === watcher }
      completion(succeeded)
    }
    seeks.append(watcher)
    request.delegate = watcher
  }

  func requestStatus() {
    client.requestStatus()
  }

  func remoteMediaClient(_ client: GCKRemoteMediaClient, didUpdate mediaStatus: GCKMediaStatus?) {
    ear?.castMediaDidUpdateStatus()
  }
}

private final class SeekWatcher: NSObject, GCKRequestDelegate {
  private let done: (SeekWatcher, Bool) -> Void

  init(done: @escaping (SeekWatcher, Bool) -> Void) {
    self.done = done
  }

  func requestDidComplete(_ request: GCKRequest) { done(self, true) }
  func request(_ request: GCKRequest, didFailWithError error: GCKError) { done(self, false) }
  func request(_ request: GCKRequest, didAbortWith abortReason: GCKRequestAbortReason) { done(self, false) }
}

/// Timers on the main queue, cancellable, as the engine and the debug probe run theirs.
private let mainQueueDelivery: CastEngine.Delivery = { delayMs, run in
  let work = DispatchWorkItem(block: run)
  DispatchQueue.main.asyncAfter(deadline: .now() + delayMs / 1000, execute: work)
  return { work.cancel() }
}

extension CastEngine {
  /// The engine for this device on the shared receiver channel hub, its timers on the main queue.
  /// Nil until the Cast context exists.
  static func make(server: ReceiverServer) -> CastEngine? {
    CastContextBootstrap.initializeIfNeeded()
    guard GCKCastContext.isSharedInstanceInitialized() else { return nil }
    GoogleCastChannelBinding.install()
    return CastEngine(
      server: server,
      sessions: GoogleCastSessionSource(),
      hub: .shared,
      deliver: mainQueueDelivery,
      log: { Logger.shared.log($0, type: "CastEngine") }
    )
  }
}

#if DEBUG
extension CastEngineProbe {
  private static var current: CastEngineProbe?

  /// One probe at a time on the app's hub. Debug builds log through Logger, which prints each line
  /// with its type, so the console reads [CastEngine], [CastEngineProbe] and [ReceiverChannelHub].
  static func arm() {
    guard current?.isActive != true else { return }
    ReceiverChannelHub.shared.log = { Logger.shared.log($0, type: "ReceiverChannelHub") }
    let probe = CastEngineProbe(
      hub: .shared,
      makeEngine: { CastEngine.make(server: $0) },
      deliver: mainQueueDelivery,
      log: { Logger.shared.log($0, type: "CastEngineProbe") }
    )
    current = probe
    probe.arm()
  }
}
#endif
#endif
