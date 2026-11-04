package expo.modules.mpvplayer

/**
 * Tells the file mpv is playing apart from the one the latest load() asked for.
 *
 * load() runs on the main thread and only asks mpv to replace the file. Until
 * mpv starts the new one, the time-pos, duration and paused clock delivered on
 * the event thread still describe the file being replaced, while JS reports
 * the first position after a swap at once, under the new item: one stale value
 * near the end of the old file marks the new item played. Mirror of the load
 * generations in the iOS renderer.
 *
 * A load replaced before mpv got to its file never starts, so a start is
 * matched to its load by the playlist entry mpv made for it, not by order.
 */
internal class MpvLoadGenerations {
    private val lock = Any()
    // Loads whose file mpv has not started yet, oldest first: entry id (null
    // when it could not be read) to generation.
    private val pending = ArrayDeque<Pair<Long?, Long>>()
    // The entry mpv last started, for a start that beats load() to recording its entry.
    private var startedEntryId: Long? = null
    @Volatile private var requested = 0L
    @Volatile private var active = 0L

    /** Main thread, as load() starts. */
    fun begin(): Long = synchronized(lock) { ++requested }

    /** Main thread, once loadfile has made the playlist entry of [generation]. */
    fun queue(generation: Long, entryId: Long?) {
        synchronized(lock) {
            pending.addLast(entryId to generation)
            if (entryId != null && entryId == startedEntryId) activateAt(pending.lastIndex)
        }
    }

    /**
     * Event thread, at MPV_EVENT_START_FILE, with the entry mpv is playing:
     * null once a newer load has taken it out of the playlist. Returns whether
     * a load became current.
     */
    fun onStartFile(entryId: Long?): Boolean = synchronized(lock) {
        startedEntryId = entryId
        if (entryId == null) return@synchronized false
        // A load whose entry id could not be read falls back to order, so it
        // still becomes current instead of holding every position back.
        val index = pending.indexOfFirst { it.first == entryId }.takeIf { it >= 0 }
            ?: pending.indexOfFirst { it.first == null }
        if (index < 0) return@synchronized false
        activateAt(index)
        true
    }

    private fun activateAt(index: Int) {
        active = pending[index].second
        // The loads queued before it were replaced before mpv got to their file.
        repeat(index + 1) { pending.removeFirst() }
    }

    /** Teardown: nothing is current until the next load's file starts. */
    fun reset() {
        synchronized(lock) {
            pending.clear()
            startedEntryId = null
            active = 0
        }
    }

    /** The current file's generation, or null while a load waits for its file. */
    val current: Long?
        get() = active.takeIf { it == requested }

    /**
     * Runs [write] if the value it stores belongs to the file the latest load()
     * asked for, and returns that file's generation, or null. Atomic with
     * [begin]: a value read before a load cannot land after it, in the cache
     * that load seeded.
     */
    fun ifCurrent(write: () -> Unit): Long? = synchronized(lock) { current?.also { write() } }

    /** Main thread: whether nothing was loaded since [generation] was current. */
    fun isLatest(generation: Long): Boolean = generation == requested
}
