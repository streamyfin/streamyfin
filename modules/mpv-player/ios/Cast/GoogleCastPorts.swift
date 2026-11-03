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
#endif
