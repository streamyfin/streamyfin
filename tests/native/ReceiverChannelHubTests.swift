import Foundation

// The SDK takes one generic channel per namespace per session: the JS relay and the native engine
// share it through the hub, which also follows the session through suspends, resumes and ends. The
// same ten cases as ReceiverChannelHubTest.kt, plus the two that only iOS has.
@main
enum ReceiverChannelHubTests {
  static var failures: [String] = []
  static var cases = 0
  static let ns = ReceiverProtocol.namespace

  final class Recording: ReceiverBusListener {
    var messages: [String] = []
    var events: [String] = []
    func receiverBusDidReceive(_ raw: String) { messages.append(raw) }
    func receiverBusDidBecomeReady(sessionId: String) { events.append("ready " + sessionId) }
    func receiverBusDidLose(sessionId: String?, ended: Bool) {
      events.append("lost " + (sessionId ?? "nil") + " " + String(ended))
    }
  }

  static func check(_ name: String, _ ok: Bool) {
    cases += 1
    if !ok { failures.append(name) }
  }

  static func main() {
    do {
      let hub = ReceiverChannelHub()
      let port = FakeChannelPort()
      let first = Recording()
      let second = Recording()
      _ = hub.subscribe(namespace: ns, listener: first)
      hub.attach(port)
      _ = hub.subscribe(namespace: ns, listener: second)
      check("aNamespaceRegistersOncePerSessionWhateverTheSubscribers", port.registrations == [ns])
    }

    do {
      let hub = ReceiverChannelHub()
      let port = FakeChannelPort()
      let first = Recording()
      let second = Recording()
      _ = hub.subscribe(namespace: ns, listener: first)
      _ = hub.subscribe(namespace: ns, listener: second)
      hub.attach(port)
      let raw = "{\"type\":\"playbackerror\",\"message\":\"NotAllowed\"}"
      port.deliver(raw)
      check("aMessageReachesEverySubscriberAsSent", first.messages == [raw] && second.messages == [raw])
    }

    do {
      let hub = ReceiverChannelHub()
      let port = FakeChannelPort()
      let leaving = Recording()
      let staying = Recording()
      let leavingSubscription = hub.subscribe(namespace: ns, listener: leaving)
      _ = hub.subscribe(namespace: ns, listener: staying)
      hub.attach(port)
      leavingSubscription.remove()
      port.deliver("next")
      check("removingOneSubscriberKeepsTheRegistrationForTheOther", port.unregistrations.isEmpty && staying.messages == ["next"])
    }

    do {
      let hub = ReceiverChannelHub()
      let port = FakeChannelPort()
      let first = Recording()
      let second = Recording()
      let firstSubscription = hub.subscribe(namespace: ns, listener: first)
      let secondSubscription = hub.subscribe(namespace: ns, listener: second)
      hub.attach(port)
      firstSubscription.remove()
      secondSubscription.remove()
      check("removingTheLastSubscriberUnregisters", port.unregistrations == [ns] && !hub.isReady(namespace: ns))
    }

    do {
      let hub = ReceiverChannelHub()
      let listener = Recording()
      _ = hub.subscribe(namespace: ns, listener: listener)
      let notConnected = FakeChannelPort(isConnected: false)
      hub.attach(notConnected)
      let quiet = notConnected.registrations.isEmpty && !hub.isReady(namespace: ns)
      let connected = FakeChannelPort()
      hub.attach(connected)
      check("aSessionNotConnectedRegistersNothingAndIsNotReady", quiet && connected.registrations == [ns] && hub.isReady(namespace: ns))
    }

    do {
      let hub = ReceiverChannelHub()
      let listener = Recording()
      _ = hub.subscribe(namespace: ns, listener: listener)
      let refusing = FakeChannelPort()
      refusing.refuse = true
      hub.attach(refusing)
      let notReady = !hub.isReady(namespace: ns)
      let next = FakeChannelPort()
      hub.attach(next)
      check("aRefusedRegistrationLeavesTheNamespaceFree", notReady && next.registrations == [ns] && hub.isReady(namespace: ns))
    }

    do {
      let hub = ReceiverChannelHub()
      let listener = Recording()
      _ = hub.subscribe(namespace: ns, listener: listener)
      hub.attach(FakeChannelPort(sessionId: "session-1"))
      hub.suspend()
      var whileSuspended: String? = "not called"
      hub.send(namespace: ns, text: "x") { whileSuspended = $0 }
      let resumed = FakeChannelPort(sessionId: "session-1")
      hub.attach(resumed)
      check(
        "aResumeRegistersAgainAndTellsTheSubscribers",
        listener.events == ["ready session-1", "lost session-1 false", "ready session-1"]
          && whileSuspended == ReceiverChannelHub.noSessionError && resumed.registrations == [ns]
      )
    }

    do {
      let hub = ReceiverChannelHub()
      let listener = Recording()
      _ = hub.subscribe(namespace: ns, listener: listener)
      let first = FakeChannelPort(sessionId: "session-1")
      hub.attach(first)
      let second = FakeChannelPort(sessionId: "session-2")
      hub.attach(second)
      first.deliver("old")
      let dropped = listener.messages.isEmpty
      second.deliver("new")
      check("aMessageFromAReplacedSessionIsDropped", dropped && listener.messages == ["new"])
    }

    do {
      let hub = ReceiverChannelHub()
      let listener = Recording()
      _ = hub.subscribe(namespace: ns, listener: listener)
      hub.attach(FakeChannelPort(sessionId: "session-1"))
      hub.end()
      var error: String?
      hub.send(namespace: ns, text: "x") { error = $0 }
      check(
        "endForgetsTheRegistrationsAndRefusesToSend",
        listener.events.last == "lost session-1 true" && error == ReceiverChannelHub.noSessionError && !hub.isReady(namespace: ns)
      )
    }

    do {
      let hub = ReceiverChannelHub()
      let port = FakeChannelPort()
      var observed: [String] = []
      hub.sendObserver = { namespace, text in observed.append(namespace + " " + text) }
      let listener = Recording()
      _ = hub.subscribe(namespace: ns, listener: listener)
      hub.attach(port)
      var error: String? = "not called"
      hub.send(namespace: ns, text: "x") { error = $0 }
      check(
        "aSendGoesToTheAttachedPortAndToTheObserver",
        port.sent.map { $0.namespace + " " + $0.text } == [ns + " x"] && error == nil && observed == [ns + " x"]
      )
    }

    // A GCKGenericChannel added to a session connects later and says so: until then nothing the
    // sender writes on it reaches the receiver.
    do {
      let hub = ReceiverChannelHub()
      let listener = Recording()
      _ = hub.subscribe(namespace: ns, listener: listener)
      let port = FakeChannelPort(sessionId: "session-1")
      port.channelConnected = false
      hub.attach(port)
      let notYet = !hub.isReady(namespace: ns) && listener.events.isEmpty
      port.connect()
      check("aChannelIsReadyOnlyOnceItConnects", notYet && listener.events == ["ready session-1"] && hub.isReady(namespace: ns))
    }

    // The hub holds its listeners weakly: an engine let go of without unsubscribing goes away.
    do {
      let hub = ReceiverChannelHub()
      let port = FakeChannelPort()
      var released: Recording? = Recording()
      weak var releasedRef: Recording?
      releasedRef = released
      let staying = Recording()
      _ = hub.subscribe(namespace: ns, listener: released!)
      _ = hub.subscribe(namespace: ns, listener: staying)
      hub.attach(port)
      released = nil
      port.deliver("after")
      check("aReleasedListenerIsDropped", releasedRef == nil && staying.messages == ["after"])
    }

    if failures.isEmpty {
      print("PASS: receiver channel hub (" + String(cases) + " cases)")
    } else {
      failures.forEach { print("FAIL: " + $0) }
      exit(1)
    }
  }
}
