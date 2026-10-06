package expo.modules.mpvplayer.nativeplayer

/**
 * Whether a press in the queue may become a request. The controls themselves
 * stay enabled on TV, where a disabled one would drop focus, so the press is
 * what gets refused.
 */
internal fun syncPlayQueueActionAllowed(available: Boolean, busy: Boolean): Boolean =
    available && !busy
