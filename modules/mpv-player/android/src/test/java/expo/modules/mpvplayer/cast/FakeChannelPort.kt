package expo.modules.mpvplayer.cast

/** A session's receiver channel without the SDK: records what the hub asks of it and plays the receiver back. */
class FakeChannelPort(
    override val sessionId: String? = "session-1",
    override val isConnected: Boolean = true,
) : ReceiverChannelPort {
    val registrations = mutableListOf<String>()
    val unregistrations = mutableListOf<String>()
    val sent = mutableListOf<Pair<String, String>>()

    /** Makes the SDK refuse the registration, as a session that lost its connection does. */
    var refuse = false

    /** What the SDK answers a send with: null for success, else its status message. */
    var sendError: String? = null

    private var onMessage: ((String) -> Unit)? = null

    override fun register(namespace: String, onMessage: (String) -> Unit): Boolean {
        if (refuse) return false
        registrations += namespace
        this.onMessage = onMessage
        return true
    }

    override fun unregister(namespace: String) {
        unregistrations += namespace
    }

    override fun send(namespace: String, text: String, done: (String?) -> Unit) {
        sent += namespace to text
        done(sendError)
    }

    /** A message from the receiver, as the SDK hands it over: to the last callback registered here. */
    fun deliver(raw: String) {
        onMessage?.invoke(raw)
    }
}
