package expo.modules.mpvplayer.cast.engine

import java.util.WeakHashMap

/**
 * One listener per session, all removed together. A Cast session keeps the listeners added to it, so
 * without the removal each engine created over a session stayed reachable through it for the
 * session's lifetime.
 */
internal class SessionListeners<S : Any, L : Any>(
    private val add: (S, L) -> Unit,
    private val remove: (S, L) -> Unit,
) {
    private val listeners = WeakHashMap<S, L>()

    fun ensure(session: S, make: () -> L) {
        if (session in listeners) return
        val listener = make()
        add(session, listener)
        listeners[session] = listener
    }

    fun clear() {
        listeners.forEach { (session, listener) -> remove(session, listener) }
        listeners.clear()
    }
}
