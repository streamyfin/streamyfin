package expo.modules.mpvplayer.nativeplayer

/**
 * What the phone chrome may offer for the engine it holds. Pure: the session and the view model
 * read the engine and the device, this decides. A remote engine has no screen here, so nothing
 * that drives this device's picture, brightness or decoder; speed follows what the engine allows.
 * A remote chrome is a remote control: its controls stay up, a drag leaves the target playing, and
 * nothing it offers needs the phone awake or turned (the TV goes on by itself).
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
    /** The Cast button, which hands this device's video off to a receiver: JS allows it, for a local engine. */
    val cast: Boolean = false,
    /** The controls hide on their own after a while. */
    val autoHide: Boolean = true,
    /** A drag on the bar pauses playback until it is released. */
    val pausesWhileScrubbing: Boolean = true,
    val sleepTimer: Boolean = true,
    val lockControls: Boolean = true,
    val rotate: Boolean = true,
    /**
     * The phone decides what follows the end: the next episode card counts down and starts the next one, or
     * the still watching card asks first. A remote target's list moves on by itself, and the remote screen decides
     * what its end leads to.
     */
    val nextEpisodeCountdown: Boolean = true,
) {
    companion object {
        fun of(isRemote: Boolean, pictureInPictureSupported: Boolean, canChangeSpeed: Boolean, allowCast: Boolean = false) =
            ChromeCapabilities(
                pictureInPicture = !isRemote && pictureInPictureSupported,
                zoom = !isRemote,
                brightness = !isRemote,
                decoderSettings = !isRemote,
                technicalInfo = !isRemote,
                speed = canChangeSpeed,
                cast = !isRemote && allowCast,
                autoHide = !isRemote,
                pausesWhileScrubbing = !isRemote,
                sleepTimer = !isRemote,
                lockControls = !isRemote,
                rotate = !isRemote,
                nextEpisodeCountdown = !isRemote,
            )
    }
}
