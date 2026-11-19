package expo.modules.mpvplayer.nativeplayer

/**
 * The player the module presents, local or remote: what the calls common to both reach (dismiss, the
 * update* family, notices). The local player's own calls (load, mpv tracks, SyncPlay, technical info) go to
 * [NativePlayerSession] only.
 */
interface PresentedPlayer {
    val viewModel: PlayerViewModel

    /**
     * Whether JS's transport calls (play, pause, seekTo, setSpeed, toggleMute) reach it: the local player
     * only. A server command addressed to the phone must never drive the TV.
     */
    val acceptsJsTransport: Boolean

    fun dismiss(reason: String, completion: (() -> Unit)? = null)

    /** Gone at once, nothing emitted: the app reloads under it. */
    fun teardownImmediately()
}

/** The view model JS's transport calls drive, null when no player takes them. */
internal fun jsTransportTarget(presented: PresentedPlayer?): PlayerViewModel? =
    presented?.takeIf { it.acceptsJsTransport }?.viewModel
