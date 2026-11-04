package expo.modules.mpvplayer.cast.engine

import org.junit.Assert.assertEquals
import org.junit.Test

// A Cast session keeps the listeners added to it: one per session, all removed when the engine stops
// listening, or each engine created over a session stayed reachable through it.
class SessionListenersTest {
    @Test
    fun oneListenerPerSessionAllRemovedTogether() {
        val added = mutableListOf<Pair<String, Int>>()
        val removed = mutableListOf<Pair<String, Int>>()
        var made = 0
        val listeners = SessionListeners<String, Int>({ session, listener -> added += session to listener }) { session, listener ->
            removed += session to listener
        }
        listeners.ensure("a") { ++made }
        listeners.ensure("a") { ++made }
        listeners.ensure("b") { ++made }
        assertEquals(listOf("a" to 1, "b" to 2), added)

        listeners.clear()
        assertEquals(listOf("a" to 1, "b" to 2), removed.sortedBy { it.second })

        listeners.ensure("a") { ++made }
        assertEquals("a" to 3, added.last())
    }
}
