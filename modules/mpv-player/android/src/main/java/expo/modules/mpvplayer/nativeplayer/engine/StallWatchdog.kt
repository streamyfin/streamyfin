package expo.modules.mpvplayer.nativeplayer.engine

/**
 * When the ExoPlayer engine rebuilds a pipeline whose source stopped answering:
 * playback has been buffering while playing, against an (almost) empty forward
 * buffer, for [stallAfterMs], after media flowed since the last load or seek.
 *
 * At most [maxReloads] rebuilds until a genuinely new load. The engine's own
 * forced reloads keep counting, and keep the media they replaced: one that
 * lands in the same wedge is retried, which is what the budget is for.
 *
 * A seek disarms it until media flows again: the first media after a seek can
 * take long to come (a transcode starting over at the new position), and a
 * rebuild would abandon the very request the server is producing.
 */
internal class StallWatchdog(
    private val stallAfterMs: Long,
    private val maxReloads: Int,
) {
    private var mediaFlowed = false
    private var stalledSinceMs: Long? = null

    /** Rebuilds spent since the last new load. */
    var reloads = 0
        private set

    /** [forced] is the engine's own reload of the same stream. */
    fun onLoad(forced: Boolean) {
        stalledSinceMs = null
        if (!forced) {
            mediaFlowed = false
            reloads = 0
        }
    }

    fun onSeek() {
        mediaFlowed = false
        stalledSinceMs = null
    }

    /** Media is flowing (STATE_READY). The budget does not re-arm here. */
    fun onReady() {
        mediaFlowed = true
        stalledSinceMs = null
    }

    /** True when the pipeline should be rebuilt now; counts the rebuild. */
    fun shouldReload(starved: Boolean, nowMs: Long): Boolean {
        if (!starved) {
            stalledSinceMs = null
            return false
        }
        if (!mediaFlowed) return false
        val since = stalledSinceMs ?: nowMs.also { stalledSinceMs = it }
        if (nowMs - since < stallAfterMs) return false
        if (reloads >= maxReloads) return false
        reloads++
        stalledSinceMs = null
        return true
    }
}
