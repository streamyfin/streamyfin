package expo.modules.mpvplayer

import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Tells the file mpv is playing apart from the one the latest load() asked for.
 *
 * load() runs on the main thread and only asks mpv to replace the file. Until
 * mpv starts the new one, the time-pos, duration and paused clock delivered on
 * the event thread still describe the file being replaced, while JS reports
 * the first position after a swap at once, under the new item: one stale value
 * near the end of the old file marks the new item played. Mirror of the load
 * generations in the iOS renderer.
 */
internal class MpvLoadGenerations {
    private val lock = Any()
    private val pending = ConcurrentLinkedQueue<Long>()
    @Volatile private var requested = 0L
    @Volatile private var active = 0L

    /** Main thread, as load() starts. */
    fun begin(): Long = synchronized(lock) { ++requested }

    /** Main thread, right before the loadfile command of [generation]. */
    fun queue(generation: Long) {
        pending.add(generation)
    }

    /** Event thread, at MPV_EVENT_START_FILE. */
    fun onStartFile() {
        pending.poll()?.let { active = it }
    }

    /** Teardown: nothing is current until the next load's file starts. */
    fun reset() {
        pending.clear()
        active = 0
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
