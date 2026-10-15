package expo.modules.mpvplayer.nativeplayer

internal fun shouldLeaveSyncPlayOnActivityStop(
    ownsActivity: Boolean,
    syncPlayActive: Boolean,
    inPictureInPicture: Boolean,
    changingConfigurations: Boolean,
    dismissing: Boolean
): Boolean = ownsActivity && syncPlayActive && !inPictureInPicture &&
    !changingConfigurations && !dismissing

/**
 * Leaving picture in picture has two ends. Expanding it brings the activity
 * back to the front, still in the group. Closing its window leaves a stopped
 * activity behind, which is the app going to the background.
 */
internal fun shouldLeaveSyncPlayOnPictureInPictureEnd(
    inPictureInPicture: Boolean,
    activityStopped: Boolean,
    syncPlayActive: Boolean,
    dismissing: Boolean
): Boolean = !inPictureInPicture && activityStopped && syncPlayActive && !dismissing
