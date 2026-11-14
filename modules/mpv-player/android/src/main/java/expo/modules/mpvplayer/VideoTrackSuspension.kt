package expo.modules.mpvplayer

import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** The mpv properties a [VideoTrackSuspension] reads and writes. */
internal interface TrackProperties {
    fun get(name: String): String?
    fun set(name: String, value: String)
}

/**
 * Audio only while hidden: switches mpv's video track off (vid=no) and back.
 *
 * Every switch waits for the player core, which can be busy for seconds, so
 * they all run on [worker], one at a time and in the order they were asked
 * for. [endForNextFile] drops the switches still queued for the file being
 * replaced and puts the track selection back to automatic.
 */
internal class VideoTrackSuspension(
    private val worker: Executor,
    private val log: (String) -> Unit = {},
    private val warn: (String) -> Unit = {},
) {
    // Which file a queued switch was asked for: endForNextFile moves it on,
    // and a switch queued for an earlier file is dropped.
    private val epoch = AtomicInteger(0)
    // The track switched off, to restore. Written on the worker only.
    private val suspended = AtomicReference<String?>(null)
    // A switch wrote vid since the last file change. Worker only. Kept apart
    // from the suspension: a restore that passed its check before a file
    // change still writes the old file's track and clears the suspension.
    private var trackWritten = false

    /** The track is off on purpose, and comes back with the surface. */
    val isSuspended: Boolean get() = suspended.get() != null

    fun suspend(props: TrackProperties) {
        val askedFor = epoch.get()
        worker.execute {
            if (askedFor != epoch.get()) return@execute
            try {
                // Without an audio track there is nothing left to play: mpv
                // would reach the end of the file.
                val aid = props.get("aid")
                if (aid.isNullOrEmpty() || aid == "no") return@execute
                val vid = props.get("vid")
                if (vid.isNullOrEmpty() || vid == "no") return@execute
                suspended.set(vid)
                trackWritten = true
                props.set("vid", "no")
                log("audio only — video track $vid off")
            } catch (e: Exception) {
                warn("could not switch to audio only: ${e.message}")
            }
        }
    }

    fun restore(props: TrackProperties) {
        val askedFor = epoch.get()
        worker.execute {
            if (askedFor != epoch.get()) return@execute
            val vid = suspended.get() ?: return@execute
            trackWritten = true
            try {
                props.set("vid", vid)
                log("video track $vid back")
            } catch (e: Exception) {
                warn("could not restore the video track: ${e.message}")
            }
            // Cleared only once the track is back: until then the resume
            // recovery must keep reading the missing video as intended.
            suspended.set(null)
        }
    }

    /**
     * Before a file replaces the current one, or [props] null when the player
     * stops. The worker runs in order, so this runs after a switch already
     * under way; whatever it wrote outlives the loadfile (vid=no would start
     * the next file without video, a restored ID would pick that track in
     * it), so the selection goes back to automatic.
     */
    fun endForNextFile(props: TrackProperties?) {
        epoch.incrementAndGet()
        worker.execute {
            suspended.set(null)
            if (!trackWritten) return@execute
            trackWritten = false
            try {
                props?.set("vid", "auto")
            } catch (e: Exception) {
                warn("could not reset the video track: ${e.message}")
            }
        }
    }
}
