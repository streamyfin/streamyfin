package expo.modules.mpvplayer.cast

/**
 * The app's discovery request: JS asks for it, the activity's foreground allows it, and the active scan
 * runs while both hold. A request made in the background waits for the foreground instead of scanning
 * until the next pause. Main thread only.
 */
internal class AppDiscovery(private val start: () -> Unit, private val stop: () -> Unit) {
    private var wanted = false
    private var foreground = true

    /** Asking again retries a start that found no Cast context yet. */
    fun want() {
        wanted = true
        if (foreground) start()
    }

    fun release() {
        if (!wanted) return
        wanted = false
        if (foreground) stop()
    }

    fun foreground() {
        if (foreground) return
        foreground = true
        if (wanted) start()
    }

    fun background() {
        if (!foreground) return
        foreground = false
        if (wanted) stop()
    }
}
