package expo.modules.mpvplayer.nativeplayer

/**
 * What the phone chrome may offer for the engine it holds. Pure: the session and the view model
 * read the engine and the device, this decides. A remote engine has no screen here, so nothing
 * that drives this device's picture, brightness or decoder; speed follows what the engine allows.
 */
data class ChromeCapabilities(
    val pictureInPicture: Boolean,
    /** The zoom button, its compact menu entry and the pinch. */
    val zoom: Boolean,
    /** The brightness slider and the left half's vertical drag. */
    val brightness: Boolean,
    /** The mpv audio rows, the subtitle size and the subtitle sync. */
    val decoderSettings: Boolean,
    val technicalInfo: Boolean,
    /** The speed menu, the hold to speed up and the initial speed. */
    val speed: Boolean,
) {
    companion object {
        fun of(isRemote: Boolean, pictureInPictureSupported: Boolean, canChangeSpeed: Boolean) = ChromeCapabilities(
            pictureInPicture = !isRemote && pictureInPictureSupported,
            zoom = !isRemote,
            brightness = !isRemote,
            decoderSettings = !isRemote,
            technicalInfo = !isRemote,
            speed = canChangeSpeed,
        )
    }
}
