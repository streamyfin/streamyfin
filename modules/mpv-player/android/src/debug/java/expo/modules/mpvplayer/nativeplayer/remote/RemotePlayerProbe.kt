package expo.modules.mpvplayer.nativeplayer.remote

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.MainThread
import androidx.compose.runtime.Composable
import expo.modules.mpvplayer.cast.engine.mainLooperSchedule
import expo.modules.mpvplayer.cast.output.OutputPickerPresenter
import expo.modules.mpvplayer.nativeplayer.ChapterRecord
import expo.modules.mpvplayer.nativeplayer.EpisodeListItemRecord
import expo.modules.mpvplayer.nativeplayer.MetadataRecord
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.RemotePlayerConfigRecord
import expo.modules.mpvplayer.nativeplayer.RemoteTintRecord
import expo.modules.mpvplayer.nativeplayer.TrackMenuItemRecord
import expo.modules.mpvplayer.nativeplayer.TrackMenusRecord
import expo.modules.mpvplayer.cast.playback.RemotePlayback
import expo.modules.mpvplayer.cast.receiver.ReceiverServer
import expo.modules.mpvplayer.nativeplayer.engine.RemoteEngine
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.ui.remote.RemotePlayerScreen

// The device proof of the remote screen, in debug builds only: a broadcast opens the remote chrome, with a fixed
// config, over the engine the holder keeps with a Cast session when one holds, and over a fake TV of its own
// otherwise, whatever the build's fake receivers flag says. It goes around
// the module, so a presentPlayer from JS while it is up is not refused. Everything it logs is what the
// proof reads: the commands with the fake's position, the position every few seconds, the close, and the
// fake's stop, which only the end of its holder's session may cause.
object RemotePlayerProbe {
    const val ACTION = "expo.modules.mpvplayer.REMOTE_PLAYER_PROBE"
    const val POSITION_LOG_MS = 5_000L
    const val TITLE = "Bench episode"
    const val TARGET = "Bench TV"
    private const val SERVER_URL = "https://probe.invalid"
    private const val TAG = "RemotePlayerProbe"
    private var current: RemotePlayerSession? = null

    /** One screen at a time: a broadcast while one is up does nothing. */
    @MainThread
    fun run(
        activity: Activity?,
        schedule: (Long, () -> Unit) -> (() -> Unit) = mainLooperSchedule(),
        log: (String) -> Unit = { Log.i(TAG, it) },
        look: Look = Look(),
        holder: RemotePlayback = RemotePlayback.shared,
        screenContent: @Composable (PlayerViewModel, RemoteScreenState) -> Unit = { model, screen -> RemotePlayerScreen(model, screen) },
    ): RemotePlayerSession? {
        if (current != null) {
            log("already presented")
            return null
        }
        if (activity == null) {
            log("failed: no activity to present from")
            return null
        }
        holder.engine?.let { return runOnSession(activity, schedule, log, look, holder, screenContent) }
        val main = Handler(Looper.getMainLooper())
        val fake = FakeRemoteEngine(
            schedule = schedule,
            runOnMain = { block -> if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block) },
        )
        val engine = LoggingEngine(fake, log)
        var cancelPositionLog: (() -> Unit)? = null
        // A holder of its own, its session made up: the screen borrows the fake as it would the Cast engine, and
        // the fake stops only when that session ends, after the screen handed it back.
        val playback = RemotePlayback(engineFactory = { engine }).apply {
            setServer(ReceiverServer(SERVER_URL, "probe", "probe", TARGET))
            targetChanged(connected = true, suspended = false)
        }
        val session = RemotePlayerSession(
            playback = playback,
            emit = { name, body -> if (name == "onDismiss") log("dismissed: ${body["reason"]}") },
            onTornDown = {
                cancelPositionLog?.invoke()
                current = null
                log("lease released")
                playback.targetChanged(connected = false, suspended = false)
            },
            screenContent = screenContent,
        )
        current = session
        session.present(activity, config(look, FakeRemoteEngine.DEFAULT_ITEMS.first().id))
        log("presented: $TITLE on $TARGET")

        fun logPosition() {
            cancelPositionLog = schedule(POSITION_LOG_MS) {
                log("position ${engine.currentPosition}, ${if (engine.isPausedState) "paused" else "playing"}")
                logPosition()
            }
        }
        logPosition()
        return session
    }

    // The session's engine is the holder's: the screen hands it back and the TV plays on.
    private fun runOnSession(
        activity: Activity,
        schedule: (Long, () -> Unit) -> (() -> Unit),
        log: (String) -> Unit,
        look: Look,
        holder: RemotePlayback,
        screenContent: @Composable (PlayerViewModel, RemoteScreenState) -> Unit,
    ): RemotePlayerSession {
        var cancelPositionLog: (() -> Unit)? = null
        val session = RemotePlayerSession(
            playback = holder,
            emit = { name, body -> if (name == "onDismiss") log("dismissed: ${body["reason"]}") },
            onTornDown = {
                cancelPositionLog?.invoke()
                current = null
            },
            screenContent = screenContent,
        )
        current = session
        session.present(activity, config(look, holder.snapshot.itemId))
        log("presented: $TITLE on the session's engine")

        fun logPosition() {
            cancelPositionLog = schedule(POSITION_LOG_MS) {
                val snapshot = holder.snapshot
                log("position ${snapshot.positionSec}, ${snapshot.phase.name.lowercase()}")
                logPosition()
            }
        }
        logPosition()
        return session
    }

    /**
     * What the broadcast may add to the fixed config, to hold the screen to an artwork: its URL, the tint JS would
     * send for it (`#top,#bottom,#accent`), and one header the images are asked for with. For the narrow layouts:
     * the TV's name, which of the three episodes plays (the second has one before it and one after it), and an
     * item without chapters.
     */
    data class Look(
        val artwork: String? = null,
        val tint: String? = null,
        val headerName: String? = null,
        val headerValue: String? = null,
        val target: String = TARGET,
        val episode: Int = 1,
        val chapters: Boolean = true,
    )

    /** Every slot the screen draws from its config is filled, so the proof can hold each layout to the mockups. */
    internal fun config(look: Look = Look(), itemId: String? = null) = RemotePlayerConfigRecord().also {
        it.metadata = MetadataRecord().also { metadata ->
            // The item the TV holds, as every config of ours says: the screen counts only its own item's playback.
            metadata.itemId = itemId
            metadata.title = TITLE
            metadata.subtitle = SUBTITLE
            metadata.artworkUri = look.artwork
        }
        it.tint = look.tint?.split(",")?.takeIf { parts -> parts.size == 3 }?.let { (top, bottom, accent) ->
            RemoteTintRecord().also { tint -> tint.top = top; tint.bottom = bottom; tint.accent = accent }
        }
        if (look.headerName != null && look.headerValue != null) it.imageHeaders = mapOf(look.headerName to look.headerValue)
        it.targetName = look.target
        if (look.chapters) it.chapters = CHAPTERS.map { (name, start) -> ChapterRecord().also { c -> c.name = name; c.startSec = start } }
        it.tracks = TrackMenusRecord().also { tracks ->
            tracks.audio = track("English", 1, selected = true) + track("French", 2, selected = false)
            tracks.subtitles = track("English", 3, selected = true) + track("French", 4, selected = false)
        }
        it.episodeList = (1..3).map { n ->
            EpisodeListItemRecord().also { e ->
                e.itemId = "bench-$n"
                e.title = "Bench episode $n"
                e.indexNumber = n
                e.isCurrent = n == look.episode
            }
        }
    }

    private fun track(label: String, index: Int, selected: Boolean) = listOf(
        TrackMenuItemRecord().also { t ->
            t.label = label
            t.jellyfinIndex = index
            t.selected = selected
        },
    )

    private const val SUBTITLE = "S1 E1, Bench"
    private val CHAPTERS = listOf("Opening" to 0.0, "Middle" to 40.0, "Ending" to 80.0)
}

/** The fake TV with every command the chrome sends logged, and the position each one leaves. */
private class LoggingEngine(private val inner: RemoteEngine, private val log: (String) -> Unit) : RemoteEngine by inner {
    override fun start(owner: PlayerEngine.Owner, onStarted: () -> Unit) {
        log("engine started")
        inner.start(owner, onStarted)
    }

    override fun stop() {
        log("engine stopped")
        inner.stop()
    }

    override fun play() {
        inner.play()
        log("play at ${inner.currentPosition}")
    }

    override fun pause() {
        inner.pause()
        log("pause at ${inner.currentPosition}")
    }

    override fun togglePause() {
        inner.togglePause()
        log("${if (inner.isPausedState) "pause" else "play"} at ${inner.currentPosition}")
    }

    override fun seekTo(seconds: Double) = seek("seek to $seconds") { inner.seekTo(seconds) }

    override fun seekToExact(seconds: Double) = seek("seek to $seconds") { inner.seekToExact(seconds) }

    override fun seekToTracked(seconds: Double, exact: Boolean, requestId: Long) =
        seek("seek to $seconds") { inner.seekToTracked(seconds, exact, requestId) }

    override fun seekBy(seconds: Double) = seek("seek by $seconds") { inner.seekBy(seconds) }

    private fun seek(what: String, send: () -> Unit) {
        val from = inner.currentPosition
        send()
        log("$what: $from -> ${inner.currentPosition}")
    }
}

/**
 * `adb shell am broadcast -n <package>/expo.modules.mpvplayer.nativeplayer.remote.RemotePlayerProbeReceiver -a expo.modules.mpvplayer.REMOTE_PLAYER_PROBE`,
 * with `--es artwork <url> --es tint '#top,#bottom,#accent' --es headerName <name> --es headerValue <value>` if wanted,
 * and `--es target <TV name> --ei episode 2 --ez chapters false` for the narrow layouts.
 */
class RemotePlayerProbeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != RemotePlayerProbe.ACTION) return
        val look = RemotePlayerProbe.Look(
            artwork = intent.getStringExtra("artwork"),
            tint = intent.getStringExtra("tint"),
            headerName = intent.getStringExtra("headerName"),
            headerValue = intent.getStringExtra("headerValue"),
            target = intent.getStringExtra("target") ?: RemotePlayerProbe.TARGET,
            episode = intent.getIntExtra("episode", 1),
            chapters = intent.getBooleanExtra("chapters", true),
        )
        RemotePlayerProbe.run(OutputPickerPresenter.currentActivity(), look = look)
    }
}
