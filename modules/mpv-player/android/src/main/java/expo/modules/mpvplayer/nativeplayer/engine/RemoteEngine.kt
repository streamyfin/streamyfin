package expo.modules.mpvplayer.nativeplayer.engine

import expo.modules.mpvplayer.cast.engine.CastLoadResult
import expo.modules.mpvplayer.cast.receiver.ReceiverPlayRequest
import expo.modules.mpvplayer.cast.receiver.ReceiverServer

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

    /**
     * The account's server for the commands that follow, sending nothing now. It names no cap (Auto is measured
     * at a send): the cap stays the one the last load or reload named.
     */
    fun useServer(server: ReceiverServer)

    /** Plays [request] on the TV under [server], which the commands that follow carry; a newer load supersedes it. */
    fun load(server: ReceiverServer, request: ReceiverPlayRequest, onResult: (CastLoadResult) -> Unit)

    /** The item again where it is, under [server]: how a quality change applies its new cap. */
    fun reloadCurrentItem(server: ReceiverServer)
}
