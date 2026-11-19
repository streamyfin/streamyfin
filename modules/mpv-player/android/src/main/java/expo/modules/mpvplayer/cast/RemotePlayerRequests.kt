package expo.modules.mpvplayer.cast

/**
 * Asks JS for the remote player from outside its screens: the Cast notification, through
 * [RemotePlayerLaunchActivity], and the local player's Remote. A request made while no module listens (the app
 * starting from the notification, a JS reload) is kept for the next mount; the event and the mount both take it
 * through [consume], so only one of them opens the player.
 */
object RemotePlayerRequests {
    private var pending = false
    private var listener: (() -> Unit)? = null

    fun request() {
        // Kept before it is announced: the listener's own consume() finds it.
        val heard = synchronized(this) {
            pending = true
            listener
        }
        heard?.invoke()
    }

    @Synchronized
    fun consume(): Boolean {
        val kept = pending
        pending = false
        return kept
    }

    /** The module of the JS instance in place; the remover leaves a later module's listener alone. */
    @Synchronized
    fun listen(listener: () -> Unit): () -> Unit {
        this.listener = listener
        return {
            synchronized(this) {
                if (this.listener === listener) this.listener = null
            }
        }
    }
}
