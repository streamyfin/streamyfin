package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.cast.playback.RemotePlaybackSnapshot
import expo.modules.mpvplayer.nativeplayer.engine.RemotePhase

/** What the TV button says: the TV's name, or that the session is coming back. */
sealed interface TargetLabel {
    data class Name(val name: String?) : TargetLabel
    data object Reconnecting : TargetLabel
}

/** Why the model closes the screen, with the dismiss reason JS gets. */
enum class RemoteClose(val reason: String) {
    /** The film is over, or the list ended with nothing after it. */
    PLAYBACK_ENDED("playbackEnded"),

    /** The connection to the TV is over. */
    REMOTE_ENDED("remoteEnded"),
}

/**
 * What the remote screen shows for the state of the TV, the design's table of states: a loading TV spins in the
 * play button, a reconnecting one dims the controls and cuts the transport, between two items the bar and the
 * track menus rest, a TV stopped from its remote keeps the screen and play resumes, and the end of the film or of
 * the connection closes it. Pure. Twin: RemoteScreenModel.swift.
 */
data class RemoteScreenModel(
    val targetLabel: TargetLabel,
    val controlsDimmed: Boolean,
    val transportEnabled: Boolean,
    val seekEnabled: Boolean,
    val trackMenusEnabled: Boolean,
    val playShowsSpinner: Boolean,
    val nextUpVisible: Boolean,
    /** A failure, shown whatever the rest says. */
    val failure: String?,
    /** The failure offers to play on the phone instead. */
    val canPlayHere: Boolean,
    val closes: RemoteClose?,
) {
    companion object {
        /**
         * Whether a failure shown while the TV was at [from] goes as it moves to [to]: the TV loads again or plays
         * again. A TV already loading when the failure came (a timed out load) keeps it until it plays.
         */
        fun failureClears(from: RemotePhase, to: RemotePhase): Boolean =
            from != to && (to == RemotePhase.LOADING || to == RemotePhase.PLAYING)

        /**
         * Whether the screen has seen the TV hold an item since it opened or took a new config, once the TV is at
         * [phase]. Until then an end is the item before's (the SDK keeps a finished status), not this screen's.
         */
        fun sawPlayback(before: Boolean, phase: RemotePhase): Boolean =
            before || phase == RemotePhase.PLAYING || phase == RemotePhase.PAUSED

        /**
         * [hasNext]: the phone knows an episode after this one. [reduced]: the TV plays media our server does not
         * know, so there are no track menus. [canPlayHere] only counts with a [failure]. [sawPlayback]: see
         * [sawPlayback]; an end the screen never saw play neither closes it nor offers the next episode.
         */
        fun of(
            snapshot: RemotePlaybackSnapshot,
            targetName: String?,
            hasNext: Boolean,
            reduced: Boolean,
            failure: String?,
            canPlayHere: Boolean = false,
            sawPlayback: Boolean = true,
        ): RemoteScreenModel {
            val reconnecting = snapshot.reconnecting
            // Something is loaded on the TV, so a seek or a track change has something to act on.
            val itemLoaded = snapshot.phase in setOf(RemotePhase.LOADING, RemotePhase.PLAYING, RemotePhase.PAUSED)
            val ended = snapshot.phase == RemotePhase.ENDED && sawPlayback
            return RemoteScreenModel(
                targetLabel = if (reconnecting) TargetLabel.Reconnecting else TargetLabel.Name(targetName),
                controlsDimmed = reconnecting,
                transportEnabled = !reconnecting,
                seekEnabled = !reconnecting && itemLoaded,
                trackMenusEnabled = !reconnecting && itemLoaded && !reduced,
                playShowsSpinner = !reconnecting && (snapshot.phase == RemotePhase.LOADING || snapshot.phase == RemotePhase.BETWEEN),
                nextUpVisible = snapshot.connected && ended && hasNext,
                failure = failure,
                canPlayHere = failure != null && canPlayHere,
                closes = when {
                    !snapshot.connected -> RemoteClose.REMOTE_ENDED
                    ended && !hasNext -> RemoteClose.PLAYBACK_ENDED
                    else -> null
                },
            )
        }
    }
}
