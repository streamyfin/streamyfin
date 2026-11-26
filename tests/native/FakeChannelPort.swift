import Foundation

/// The SDK's session object, which an iOS resume hands back: it keeps the channels added to it, and refuses a second
/// one for a namespace it has.
final class FakeCastSession {
  private(set) var namespaces = Set<String>()

  func add(_ namespace: String) -> Bool {
    namespaces.insert(namespace).inserted
  }

  func remove(_ namespace: String) {
    namespaces.remove(namespace)
  }
}

/// A session's receiver channel without the SDK: records what the hub asks of it and plays the receiver back.
final class FakeChannelPort: ReceiverChannelPort {
  let sessionId: String?
  let isConnected: Bool
  /// Makes the SDK refuse the registration, as a session that lost its connection does.
  var refuse = false
  /// Whether the channel is connected once registered; the SDK connects it later, then calls back.
  var channelConnected = true
  /// What the SDK answers a send with: nil for success, else its message.
  var sendError: String?
  private(set) var registrations: [String] = []
  private(set) var unregistrations: [String] = []
  private(set) var sent: [(namespace: String, text: String)] = []
  private var onMessage: ((String) -> Void)?
  private var onConnected: (() -> Void)?
  /// The session object the channels go to, when a test shares one between ports.
  private let session: FakeCastSession?

  init(sessionId: String? = "session-1", isConnected: Bool = true, session: FakeCastSession? = nil) {
    self.sessionId = sessionId
    self.isConnected = isConnected
    self.session = session
  }

  func register(namespace: String, onMessage: @escaping (String) -> Void, onConnected: @escaping () -> Void) -> Bool {
    if refuse { return false }
    if let session, !session.add(namespace) { return false }
    registrations.append(namespace)
    self.onMessage = onMessage
    self.onConnected = onConnected
    return true
  }

  func unregister(namespace: String) {
    unregistrations.append(namespace)
    session?.remove(namespace)
  }

  func isChannelConnected(namespace: String) -> Bool {
    channelConnected
  }

  /// Holds each send's result until `releaseResults()`, as Android's Play Services hands it over later.
  var holdResults = false
  private var heldResults: [() -> Void] = []

  func send(namespace: String, text: String, completion: @escaping (String?) -> Void) {
    sent.append((namespace, text))
    let error = sendError
    if holdResults { heldResults.append { completion(error) } } else { completion(error) }
  }

  func releaseResults() {
    let held = heldResults
    heldResults = []
    held.forEach { $0() }
  }

  /// A message from the receiver, handed to the last callback registered here.
  func deliver(_ raw: String) {
    onMessage?(raw)
  }

  /// The SDK reporting the channel connected.
  func connect() {
    channelConnected = true
    onConnected?()
  }
}
