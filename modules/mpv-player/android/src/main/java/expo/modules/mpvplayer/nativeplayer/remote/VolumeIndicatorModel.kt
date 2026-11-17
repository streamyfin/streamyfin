package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.nativeplayer.PlayerConstants

/** What the volume indicator shows: the TV's level, 0 to 1, and whether it is muted. Hidden is null. */
data class VolumeIndicator(val level: Double, val muted: Boolean)

/**
 * The TV's level over the remote screen: shown for a moment after each change of the receiver's volume or mute, its
 * delay restarted by the next one. Never for the level read as the screen opens, which is no change, nor without a
 * level (a fixed-volume receiver, a group). The volume keys stay the system's, which shows its own panel; this also
 * shows a change made elsewhere (another phone, the TV). [schedule] runs an action after a delay and hands back its
 * cancel: the screen gives the main looper, the tests a clock. iOS: VolumeIndicatorModel.swift.
 */
class VolumeIndicatorModel(
    private val schedule: (delayMs: Long, action: () -> Unit) -> () -> Unit,
    private val show: (VolumeIndicator?) -> Unit,
) {
    private var last: VolumeIndicator? = null
    private var cancelHide: (() -> Unit)? = null

    /** The receiver's volume as the hub publishes it; [level] null when it reports none. */
    fun update(level: Double?, muted: Boolean) {
        if (level == null) {
            last = null
            hide()
            return
        }
        val next = VolumeIndicator(level, muted)
        val previous = last
        last = next
        // The first level known (opening, or after none) is a reading, and a republished one is no change.
        if (previous == null || previous == next) return
        cancelHide?.invoke()
        show(next)
        cancelHide = schedule(PlayerConstants.REMOTE_VOLUME_INDICATOR_MS) {
            cancelHide = null
            show(null)
        }
    }

    /** The screen closes: no hide fires after it. */
    fun close() {
        cancelHide?.invoke()
        cancelHide = null
    }

    private fun hide() {
        val cancel = cancelHide ?: return
        cancel()
        cancelHide = null
        show(null)
    }
}
