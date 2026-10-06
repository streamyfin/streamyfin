package expo.modules.mpvplayer

/** Snapshot taken on mpv's event thread, delivered in order on the UI thread. */
internal data class MpvPauseReport(
    val paused: Boolean,
    val position: Double?,
    val duration: Double,
    val cacheSeconds: Double,
) {
    fun deliver(
        onProgress: (Double, Double, Double) -> Unit,
        onPause: (Boolean) -> Unit,
    ) {
        if (paused && position != null && position.isFinite() && position >= 0) {
            onProgress(position, duration, cacheSeconds)
        }
        // JS immediately persists its last progress tick when this arrives.
        onPause(paused)
    }
}
