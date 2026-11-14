package expo.modules.mpvplayer.playback

/**
 * Whether a player pauses when its activity stops. The screen turning off stops the activity
 * too, and playing on through that is what the media playback service is for. Leaving the app
 * with the screen on (Home, another app) is leaving the video: it played on hidden, held there
 * by the service and the wake lock. On TV leaving or the box going to standby always pauses, as
 * tvOS does and the TV quality guidelines ask: nobody listens to a film behind the launcher.
 */
internal fun shouldPauseOnActivityStop(
    isTelevision: Boolean,
    screenInteractive: Boolean,
    inPictureInPicture: Boolean,
    changingConfigurations: Boolean,
    dismissing: Boolean,
): Boolean = !inPictureInPicture && !changingConfigurations && !dismissing &&
    (isTelevision || screenInteractive)

/**
 * The picture in picture window was closed: its activity stays stopped behind it, and the video
 * played on with no window to show it.
 */
internal fun shouldPauseOnPictureInPictureEnd(
    inPictureInPicture: Boolean,
    activityStopped: Boolean,
    dismissing: Boolean,
): Boolean = !inPictureInPicture && activityStopped && !dismissing
