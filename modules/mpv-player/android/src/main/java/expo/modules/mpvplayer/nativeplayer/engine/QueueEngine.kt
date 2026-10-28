package expo.modules.mpvplayer.nativeplayer.engine

/**
 * The face of an engine that plays a list on a target: the current item, the next and
 * previous ones, what gets added, and the target's own volume. The local engines play
 * one item at a time and keep every default; the Cast engine fills them in.
 */
interface QueueEngine {
    /** The id of the item the target is on, null while nothing is loaded or unknown. */
    val currentItemId: String?
        get() = null

    fun skipToNext() {}
    fun skipToPrevious() {}
    fun enqueue(itemIds: List<String>) {}

    /** The target's volume, 0 to 1, null when the target has no volume of its own. */
    val targetVolume: Double?
        get() = null

    fun setTargetVolume(level: Double) {}
}
