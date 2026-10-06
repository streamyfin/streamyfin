package expo.modules.mpvplayer.nativeplayer

internal fun shouldLeaveSyncPlayOnActivityStop(
    ownsActivity: Boolean,
    syncPlayActive: Boolean,
    inPictureInPicture: Boolean,
    changingConfigurations: Boolean,
    dismissing: Boolean
): Boolean = ownsActivity && syncPlayActive && !inPictureInPicture &&
    !changingConfigurations && !dismissing
