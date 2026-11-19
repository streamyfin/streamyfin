import Foundation

/// Asks JS for the remote player from outside its screens: the local player's Remote, once that player is gone. A
/// request made while no module listens (a JS reload) is kept for the next mount; the event and the mount both take
/// it through `consume()`, so only one of them opens the player. Android's twin also serves the Cast notification.
/// Foundation only, so scripts/ios/test-remote-player-requests.sh compiles it alone.
final class RemotePlayerRequests {
  static let shared = RemotePlayerRequests()

  private let lock = NSLock()
  private var pending = false
  private var listener: (() -> Void)?
  private var listenerId = 0

  func request() {
    // Kept before it is announced: the listener's own consume() finds it.
    lock.lock()
    pending = true
    let heard = listener
    lock.unlock()
    heard?()
  }

  func consume() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    let kept = pending
    pending = false
    return kept
  }

  /// The module of the JS instance in place; the remover leaves a later module's listener alone.
  func listen(_ listener: @escaping () -> Void) -> () -> Void {
    lock.lock()
    defer { lock.unlock() }
    listenerId += 1
    let id = listenerId
    self.listener = listener
    return { [weak self] in
      guard let self else { return }
      self.lock.lock()
      defer { self.lock.unlock() }
      if self.listenerId == id { self.listener = nil }
    }
  }
}
