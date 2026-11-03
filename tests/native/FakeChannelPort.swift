import Foundation

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

  init(sessionId: String? = "session-1", isConnected: Bool = true) {
    self.sessionId = sessionId
    self.isConnected = isConnected
  }

  func register(namespace: String, onMessage: @escaping (String) -> Void, onConnected: @escaping () -> Void) -> Bool {
    if refuse { return false }
    registrations.append(namespace)
    self.onMessage = onMessage
    self.onConnected = onConnected
    return true
  }

  func unregister(namespace: String) {
    unregistrations.append(namespace)
  }

  func isChannelConnected(namespace: String) -> Bool {
    channelConnected
  }

  func send(namespace: String, text: String, completion: @escaping (String?) -> Void) {
    sent.append((namespace, text))
    completion(sendError)
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
