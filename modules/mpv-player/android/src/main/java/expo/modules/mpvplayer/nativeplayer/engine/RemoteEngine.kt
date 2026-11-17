package expo.modules.mpvplayer.nativeplayer.engine

/**
 * Where the TV is in what it plays, as the remote screen shows it. [BETWEEN]: an item just finished
 * and the TV fetches the next one of its list. [STOPPED]: stopped before the end, the session holds,
 * and play resumes where it was. [ENDED]: the list is over.
 */
enum class RemotePhase { NONE, LOADING, PLAYING, PAUSED, BETWEEN, STOPPED, ENDED }

/** A chrome engine that plays on a TV: the state the remote screen and the JS read besides the position. */
interface RemoteEngine : ChromeEngine {
    val phase: RemotePhase

    /** True from a suspension of the session to its resume: what the engine holds may be stale. */
    val reconnecting: Boolean

    /** The list the engine cast, and where in it the TV plays, -1 when nowhere in it. */
    val queueItemIds: List<String>
    val playingIndex: Int

    /** Called on the main thread when anything but the position changed: phase, item, list, index, a track, [reconnecting]. */
    var onStateChanged: (() -> Unit)?
}
