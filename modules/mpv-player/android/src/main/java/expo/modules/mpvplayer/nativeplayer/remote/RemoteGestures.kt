package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.nativeplayer.PlayerConstants

/**
 * The remote screen's two gestures (design §3.8), as decisions the screen asks for. iOS: RemoteGestures.swift.
 * No side swipe: a stray one would change what the TV plays.
 */
object RemoteGestures {
    /** A drag down that ended [distanceDp] below where it started, at [velocityDpPerSec] (down is positive), closes
     *  the screen once it covers a quarter of [heightDp] or is flicked; one ending above its start never does. */
    fun shouldDismissOnDrag(distanceDp: Double, velocityDpPerSec: Double, heightDp: Double): Boolean =
        distanceDp > 0 &&
            (distanceDp >= heightDp * PlayerConstants.REMOTE_DISMISS_DRAG_FRACTION ||
                velocityDpPerSec >= PlayerConstants.REMOTE_DISMISS_VELOCITY_DP)

    /** A double tap at [xFraction] of the artwork's width, from its physical left edge: −1 seeks back, +1 forward.
     *  Not mirrored in a right-to-left language, where time still runs left to right. */
    fun artworkTapSeek(xFraction: Double): Int = if (xFraction < 0.5) -1 else 1
}
