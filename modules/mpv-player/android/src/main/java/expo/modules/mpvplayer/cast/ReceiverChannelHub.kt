package expo.modules.mpvplayer.cast

/** Hears the receiver's bus through the hub. */
interface ReceiverBusListener {
    fun onMessage(raw: String)

    /** The namespace is registered on a session: after a resume, the receiver may need speaking to again. */
    fun onReady(sessionId: String) {}

    /** The session went away, suspended (it may come back) or ended. */
    fun onLost(sessionId: String?, ended: Boolean) {}
}

fun interface ReceiverSubscription {
    fun remove()
}

/** One session's receiver channel, with the Cast SDK behind it (SdkChannelPort) or a fake in tests. */
interface ReceiverChannelPort {
    val sessionId: String?
    val isConnected: Boolean

    /** False when the SDK refused, which leaves the namespace free for the next attach. */
    fun register(namespace: String, onMessage: (String) -> Unit): Boolean
    fun unregister(namespace: String)
    fun send(namespace: String, text: String, done: (String?) -> Unit)
}

/**
 * The SDK takes one message callback per namespace and per session, while the JS relay of CastModule
 * and the native Cast engine both listen to the receiver: the hub makes that one registration and
 * hands every message to all of them. It follows the session through suspends, resumes and ends,
 * and runs on the main thread only.
 */
class ReceiverChannelHub {
    /** Sees every message sent, before it goes; the debug probe arms on the first PlayNow. */
    var sendObserver: ((namespace: String, text: String) -> Unit)? = null

    private val subscribers = mutableMapOf<String, MutableList<ReceiverBusListener>>()
    private val registered = mutableSetOf<String>()
    private var port: ReceiverChannelPort? = null
    private var lastSessionId: String? = null

    // Bumped on every attach and detach: a callback registered on an earlier port, or on the same
    // port before a resume, still holds the old value and its messages are dropped.
    private var generation = 0

    fun attach(port: ReceiverChannelPort) {
        val previous = this.port
        if (previous != null && previous !== port) notifyLost(previous.sessionId, ended = false)
        this.port = port
        lastSessionId = port.sessionId
        generation += 1
        registered.clear()
        subscribers.keys.toList().forEach(::register)
    }

    fun suspend() = detach(ended = false)

    fun end() = detach(ended = true)

    fun subscribe(namespace: String, listener: ReceiverBusListener): ReceiverSubscription {
        subscribers.getOrPut(namespace) { mutableListOf() } += listener
        register(namespace)
        return ReceiverSubscription { unsubscribe(namespace, listener) }
    }

    fun send(namespace: String, text: String, done: (String?) -> Unit) {
        val port = this.port
        if (port == null || !port.isConnected) {
            done(NO_SESSION_ERROR)
            return
        }
        sendObserver?.invoke(namespace, text)
        port.send(namespace, text, done)
    }

    fun isReady(namespace: String): Boolean = port?.isConnected == true && namespace in registered

    private fun register(namespace: String) {
        val port = this.port ?: return
        // A client that is not connected takes the registration and does nothing with it.
        if (namespace in registered || !port.isConnected) return
        val registeredAt = generation
        val accepted = port.register(namespace) { raw ->
            if (this.port === port && generation == registeredAt) deliver(namespace, raw)
        }
        if (!accepted) return
        registered += namespace
        val sessionId = port.sessionId ?: return
        subscribers[namespace]?.toList()?.forEach { it.onReady(sessionId) }
    }

    private fun unsubscribe(namespace: String, listener: ReceiverBusListener) {
        val listeners = subscribers[namespace] ?: return
        if (!listeners.remove(listener) || listeners.isNotEmpty()) return
        subscribers.remove(namespace)
        if (registered.remove(namespace)) port?.unregister(namespace)
    }

    private fun deliver(namespace: String, raw: String) {
        subscribers[namespace]?.toList()?.forEach { it.onMessage(raw) }
    }

    // The SDK drops the channel callbacks of a session that goes away, so there is nothing to
    // unregister: only what the hub knew is forgotten.
    private fun detach(ended: Boolean) {
        val sessionId = port?.sessionId ?: lastSessionId
        port = null
        generation += 1
        registered.clear()
        notifyLost(sessionId, ended)
    }

    private fun notifyLost(sessionId: String?, ended: Boolean) {
        subscribers.values.flatten().distinct().forEach { it.onLost(sessionId, ended) }
    }

    companion object {
        val shared = ReceiverChannelHub()
        const val NO_SESSION_ERROR = "No Cast session to send on"
    }
}
