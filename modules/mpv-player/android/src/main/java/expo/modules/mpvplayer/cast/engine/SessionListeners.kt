package expo.modules.mpvplayer.cast.engine

import java.lang.ref.WeakReference
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

    /**
     * Adds [make]'s listener to [session] once. The listener reaches its session through `current`:
     * the map holds its listeners strongly, so one that held the session would keep it, entry and all.
     */
    fun ensure(session: S, make: (current: () -> S?) -> L) {
        if (session in listeners) return
        val reference = WeakReference(session)
        val listener = make(reference::get)
        add(session, listener)
        listeners[session] = listener
    }

    fun clear() {
        listeners.forEach { (session, listener) -> remove(session, listener) }
        listeners.clear()
    }
}
