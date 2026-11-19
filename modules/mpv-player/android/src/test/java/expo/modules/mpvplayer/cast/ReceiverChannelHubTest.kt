package expo.modules.mpvplayer.cast

import expo.modules.mpvplayer.cast.receiver.ReceiverProtocol
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The SDK takes one message callback per namespace per session: the JS relay and the native engine
// share it through the hub, which also follows the session through suspends, resumes and ends.
class ReceiverChannelHubTest {
    private val ns = ReceiverProtocol.NAMESPACE

    private class Recording : ReceiverBusListener {
        val messages = mutableListOf<String>()
        val events = mutableListOf<String>()
        override fun onMessage(raw: String) {
            messages += raw
        }
        override fun onReady(sessionId: String) {
            events += "ready $sessionId"
        }
        override fun onLost(sessionId: String?, ended: Boolean) {
            events += "lost $sessionId $ended"
        }
    }

    @Test
    fun aNamespaceRegistersOncePerSessionWhateverTheSubscribers() {
        val hub = ReceiverChannelHub()
        val port = FakeChannelPort()
        hub.subscribe(ns, Recording())
        hub.attach(port)
        hub.subscribe(ns, Recording())
        assertEquals(listOf(ns), port.registrations)
    }

    @Test
    fun aMessageReachesEverySubscriberAsSent() {
        val hub = ReceiverChannelHub()
        val port = FakeChannelPort()
        val first = Recording()
        val second = Recording()
        hub.subscribe(ns, first)
        hub.subscribe(ns, second)
        hub.attach(port)
        val raw = "{\"type\":\"playbackerror\",\"message\":\"NotAllowed\"}"
        port.deliver(raw)
        assertEquals(listOf(raw), first.messages)
        assertEquals(listOf(raw), second.messages)
    }

    @Test
    fun removingOneSubscriberKeepsTheRegistrationForTheOther() {
        val hub = ReceiverChannelHub()
        val port = FakeChannelPort()
        val leaving = hub.subscribe(ns, Recording())
        val staying = Recording()
        hub.subscribe(ns, staying)
        hub.attach(port)
        leaving.remove()
        port.deliver("next")
        assertEquals(emptyList<String>(), port.unregistrations)
        assertEquals(listOf("next"), staying.messages)
    }

    @Test
    fun removingTheLastSubscriberUnregisters() {
        val hub = ReceiverChannelHub()
        val port = FakeChannelPort()
        val first = hub.subscribe(ns, Recording())
        val second = hub.subscribe(ns, Recording())
        hub.attach(port)
        first.remove()
        second.remove()
        assertEquals(listOf(ns), port.unregistrations)
        assertFalse(hub.isReady(ns))
    }

    // setMessageReceivedCallbacks returns without doing anything on a client that is not connected:
    // calling the namespace ready then would leave JS and the engine deaf until the session ends.
    @Test
    fun aSessionNotConnectedRegistersNothingAndIsNotReady() {
        val hub = ReceiverChannelHub()
        hub.subscribe(ns, Recording())
        val notConnected = FakeChannelPort(isConnected = false)
        hub.attach(notConnected)
        assertEquals(emptyList<String>(), notConnected.registrations)
        assertFalse(hub.isReady(ns))
        val connected = FakeChannelPort()
        hub.attach(connected)
        assertEquals(listOf(ns), connected.registrations)
        assertTrue(hub.isReady(ns))
    }

    // A registration the SDK refuses must leave the namespace free, or every later attach skips it
    // for the rest of the session and the receiver's messages never arrive.
    @Test
    fun aRefusedRegistrationLeavesTheNamespaceFree() {
        val hub = ReceiverChannelHub()
        hub.subscribe(ns, Recording())
        val refusing = FakeChannelPort().apply { refuse = true }
        hub.attach(refusing)
        assertFalse(hub.isReady(ns))
        val next = FakeChannelPort()
        hub.attach(next)
        assertEquals(listOf(ns), next.registrations)
        assertTrue(hub.isReady(ns))
    }

    // A resume rebuilds the Cast client and drops its channel callbacks: the hub registers again
    // and tells its subscribers, who may need to speak to the receiver again.
    @Test
    fun aResumeRegistersAgainAndTellsTheSubscribers() {
        val hub = ReceiverChannelHub()
        val listener = Recording()
        hub.subscribe(ns, listener)
        hub.attach(FakeChannelPort("session-1"))
        hub.suspend()
        var whileSuspended: String? = "not called"
        hub.send(ns, "x") { whileSuspended = it }
        val resumed = FakeChannelPort("session-1")
        hub.attach(resumed)
        assertEquals(listOf("ready session-1", "lost session-1 false", "ready session-1"), listener.events)
        assertEquals(ReceiverChannelHub.NO_SESSION_ERROR, whileSuspended)
        assertEquals(listOf(ns), resumed.registrations)
    }

    // A message already queued from the session that was replaced arrives after the new binding:
    // it is no longer this session's, and nobody may act on it.
    @Test
    fun aMessageFromAReplacedSessionIsDropped() {
        val hub = ReceiverChannelHub()
        val listener = Recording()
        hub.subscribe(ns, listener)
        val first = FakeChannelPort("session-1")
        hub.attach(first)
        val second = FakeChannelPort("session-2")
        hub.attach(second)
        first.deliver("old")
        assertEquals(emptyList<String>(), listener.messages)
        second.deliver("new")
        assertEquals(listOf("new"), listener.messages)
    }

    @Test
    fun endForgetsTheRegistrationsAndRefusesToSend() {
        val hub = ReceiverChannelHub()
        val listener = Recording()
        hub.subscribe(ns, listener)
        hub.attach(FakeChannelPort("session-1"))
        hub.end()
        var error: String? = null
        hub.send(ns, "x") { error = it }
        assertEquals("lost session-1 true", listener.events.last())
        assertEquals(ReceiverChannelHub.NO_SESSION_ERROR, error)
        assertFalse(hub.isReady(ns))
    }

    @Test
    fun aSendGoesToTheAttachedPortAndToTheObserver() {
        val hub = ReceiverChannelHub()
        val port = FakeChannelPort()
        val observed = mutableListOf<Pair<String, String>>()
        hub.sendObserver = { namespace, text -> observed += namespace to text }
        hub.subscribe(ns, Recording())
        hub.attach(port)
        var error: String? = "not called"
        hub.send(ns, "x") { error = it }
        assertEquals(listOf(ns to "x"), port.sent)
        assertNull(error)
        assertEquals(listOf(ns to "x"), observed)
    }

    // What the hub does with the session reaches its log, and never a message: the debug probe reads it.
    @Test
    fun logsWhatItDoesWithTheSessionButNeverAMessage() {
        val hub = ReceiverChannelHub()
        val port = FakeChannelPort()
        val logs = mutableListOf<String>()
        hub.log = { logs += it }
        hub.subscribe(ns, Recording())
        hub.attach(port)
        hub.subscribe(ns, Recording())
        hub.send(ns, "{\"accessToken\":\"tok-123\"}") {}
        port.deliver("{\"type\":\"playbackprogress\"}")
        hub.suspend()
        port.refuse = true
        hub.attach(port)
        hub.end()
        assertEquals(
            listOf(
                "subscribed $ns subscribers=1",
                "attached session=session-1",
                "registered $ns session=session-1 subscribers=1",
                "subscribed $ns subscribers=2",
                "suspended session=session-1",
                "attached session=session-1",
                "register refused $ns session=session-1",
                "ended session=session-1",
            ),
            logs,
        )
    }
}
