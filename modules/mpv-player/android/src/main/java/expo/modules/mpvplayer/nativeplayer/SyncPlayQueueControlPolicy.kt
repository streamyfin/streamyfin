package expo.modules.mpvplayer.nativeplayer

/** Busy TV controls retain their focus node, but cannot submit another request. */
internal fun syncPlayQueueControlEnabled(available: Boolean, busy: Boolean, isTv: Boolean): Boolean =
    available && (isTv || !busy)

/**
 * A control whose availability follows the queue (previous and next at the
 * ends, move at an edge, clear on an empty queue). The queue changes under the
 * focused control, often because of its own press, so on TV it keeps its focus
 * node and the press is dropped instead.
 */
internal fun syncPlayQueueGatedControlEnabled(enabled: Boolean, capable: Boolean, isTv: Boolean): Boolean =
    enabled && (isTv || capable)

internal fun syncPlayQueueActionAllowed(available: Boolean, busy: Boolean): Boolean =
    available && !busy
