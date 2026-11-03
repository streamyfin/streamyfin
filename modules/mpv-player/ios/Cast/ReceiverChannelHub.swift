import Foundation

/// Hears the receiver's bus through the hub.
protocol ReceiverBusListener: AnyObject {
  func receiverBusDidReceive(_ raw: String)

  /// The namespace's channel is connected on a session: after a resume, the receiver may need speaking to again.
  func receiverBusDidBecomeReady(sessionId: String)

  /// The session went away, suspended (it may come back) or ended.
  func receiverBusDidLose(sessionId: String?, ended: Bool)
}

/// One session's receiver channels, with the Cast SDK behind it (GoogleCastPorts.swift) or a fake in tests.
protocol ReceiverChannelPort: AnyObject {
  var sessionId: String? { get }
  var isConnected: Bool { get }

  /// False when the SDK refused, which leaves the namespace free for the next attach. The channel
  /// connects after it is added, and `onConnected` says when.
  func register(namespace: String, onMessage: @escaping (String) -> Void, onConnected: @escaping () -> Void) -> Bool
  func unregister(namespace: String)
  func isChannelConnected(namespace: String) -> Bool
  func send(namespace: String, text: String, completion: @escaping (String?) -> Void)
}

/// Letting go of a subscription keeps the listener subscribed until it is released: only `remove` ends it.
final class ReceiverSubscription {
  private var onRemove: (() -> Void)?

  init(onRemove: @escaping () -> Void) {
    self.onRemove = onRemove
  }

  func remove() {
    let onRemove = self.onRemove
    self.onRemove = nil
    onRemove?()
  }
}

/// The SDK takes one generic channel per namespace and per session, while the JS relay of CastModule
/// and the native Cast engine both listen to the receiver: the hub adds that one channel and hands
/// every message to all of them. It follows the session through suspends, resumes and ends, holds
/// its listeners weakly, and runs on the main thread only.
final class ReceiverChannelHub {
  static let shared = ReceiverChannelHub()
  static let noSessionError = "No Cast session to send on"

  /// Sees every message sent, before it goes; the debug probe arms on the first PlayNow.
  var sendObserver: ((_ namespace: String, _ text: String) -> Void)?

  /// Hears what the hub does with the session, and never a message; the debug probe logs it.
  var log: ((String) -> Void)?

  private struct Subscriber {
    let token: Int
    weak var listener: ReceiverBusListener?
  }

  private var subscribers: [String: [Subscriber]] = [:]
  private var registered = Set<String>()
  // The registered namespaces whose channel connected, each announced once per registration.
  private var connected = Set<String>()
  private var port: ReceiverChannelPort?
  private var lastSessionId: String?
  private var lastToken = 0

  // Bumped on every attach and detach: a callback registered on an earlier port, or on the same
  // port before a resume, still holds the old value and is dropped.
  private var generation = 0

  func attach(_ port: ReceiverChannelPort) {
    if let previous = self.port, previous !== port {
      notifyLost(sessionId: previous.sessionId, ended: false)
    }
    self.port = port
    lastSessionId = port.sessionId
    generation += 1
    registered.removeAll()
    connected.removeAll()
    log?("attached session=\(port.sessionId ?? "nil")")
    Array(subscribers.keys).forEach { register($0) }
  }

  func suspend() {
    detach(ended: false)
  }

  func end() {
    detach(ended: true)
  }

  func subscribe(namespace: String, listener: ReceiverBusListener) -> ReceiverSubscription {
    lastToken += 1
    let token = lastToken
    subscribers[namespace, default: []].append(Subscriber(token: token, listener: listener))
    log?("subscribed \(namespace) subscribers=\(subscribers[namespace]?.count ?? 0)")
    register(namespace)
    return ReceiverSubscription { [weak self] in
      self?.unsubscribe(namespace: namespace, token: token)
    }
  }

  func send(namespace: String, text: String, completion: @escaping (String?) -> Void) {
    guard let port, port.isConnected else {
      completion(Self.noSessionError)
      return
    }
    sendObserver?(namespace, text)
    port.send(namespace: namespace, text: text, completion: completion)
  }

  func isReady(namespace: String) -> Bool {
    guard let port, port.isConnected else { return false }
    return connected.contains(namespace) && port.isChannelConnected(namespace: namespace)
  }

  private func register(_ namespace: String) {
    // A session that is not connected takes no channel.
    guard let port, port.isConnected, !registered.contains(namespace) else { return }
    let registeredAt = generation
    let accepted = port.register(
      namespace: namespace,
      onMessage: { [weak self, weak port] raw in
        guard let self, let port, self.port === port, self.generation == registeredAt else { return }
        self.deliver(namespace: namespace, raw: raw)
      },
      onConnected: { [weak self, weak port] in
        guard let self, let port, self.port === port, self.generation == registeredAt else { return }
        self.announceConnected(namespace)
      }
    )
    guard accepted else {
      log?("register refused \(namespace) session=\(port.sessionId ?? "nil")")
      return
    }
    registered.insert(namespace)
    log?("registered \(namespace) session=\(port.sessionId ?? "nil") subscribers=\(subscribers[namespace]?.count ?? 0)")
    if port.isChannelConnected(namespace: namespace) {
      announceConnected(namespace)
    }
  }

  private func announceConnected(_ namespace: String) {
    guard registered.contains(namespace), connected.insert(namespace).inserted else { return }
    guard let sessionId = port?.sessionId else { return }
    listeners(of: namespace).forEach { $0.receiverBusDidBecomeReady(sessionId: sessionId) }
  }

  private func unsubscribe(namespace: String, token: Int) {
    guard var namespaceSubscribers = subscribers[namespace] else { return }
    namespaceSubscribers.removeAll { $0.token == token || $0.listener == nil }
    guard namespaceSubscribers.isEmpty else {
      subscribers[namespace] = namespaceSubscribers
      return
    }
    subscribers[namespace] = nil
    connected.remove(namespace)
    if registered.remove(namespace) != nil {
      port?.unregister(namespace: namespace)
    }
  }

  private func deliver(namespace: String, raw: String) {
    listeners(of: namespace).forEach { $0.receiverBusDidReceive(raw) }
  }

  // The SDK drops the channels of a session that goes away, so there is nothing to unregister:
  // only what the hub knew is forgotten.
  private func detach(ended: Bool) {
    let sessionId = port?.sessionId ?? lastSessionId
    port = nil
    generation += 1
    registered.removeAll()
    connected.removeAll()
    log?("\(ended ? "ended" : "suspended") session=\(sessionId ?? "nil")")
    notifyLost(sessionId: sessionId, ended: ended)
  }

  private func notifyLost(sessionId: String?, ended: Bool) {
    var seen = Set<ObjectIdentifier>()
    let everyone = subscribers.keys.flatMap { listeners(of: $0) }.filter { seen.insert(ObjectIdentifier($0)).inserted }
    everyone.forEach { $0.receiverBusDidLose(sessionId: sessionId, ended: ended) }
  }

  // The live listeners of a namespace, in subscription order; released ones are dropped on the way.
  private func listeners(of namespace: String) -> [ReceiverBusListener] {
    guard let namespaceSubscribers = subscribers[namespace] else { return [] }
    let live = namespaceSubscribers.filter { $0.listener != nil }
    if live.count != namespaceSubscribers.count {
      subscribers[namespace] = live
    }
    return live.compactMap { $0.listener }
  }
}
