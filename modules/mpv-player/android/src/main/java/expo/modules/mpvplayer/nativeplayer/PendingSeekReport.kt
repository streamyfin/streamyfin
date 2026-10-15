package expo.modules.mpvplayer.nativeplayer

/** Only a decoder completion belonging to this request may force persistence. */
internal class PendingSeekReport {
    private var nextId = 0L
    private var requestId: Long? = null
    private var target: Double? = null

    fun request(position: Double): Long {
        target = position
        return (++nextId).also { requestId = it }
    }
    fun reset() { requestId = null; target = null }

    fun acceptCompletion(id: Long, position: Double): Boolean {
        if (requestId != id || !position.isFinite() || position < 0) return false
        if (target?.isFinite() != true) return false
        // Completion identifies the seek. Solo playback may legitimately
        // land on a keyframe away from its requested target.
        // A renderer may coalesce overlapping seeks or send another restart.
        // Every final physical snapshot for the current request must persist.
        return true
    }
}
