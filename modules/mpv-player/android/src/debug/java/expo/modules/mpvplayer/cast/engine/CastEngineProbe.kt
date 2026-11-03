package expo.modules.mpvplayer.cast.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.annotation.MainThread
import expo.modules.mpvplayer.cast.ReceiverBusListener
import expo.modules.mpvplayer.cast.ReceiverChannelHub
import expo.modules.mpvplayer.cast.ReceiverSubscription
import expo.modules.mpvplayer.cast.receiver.ReceiverProtocol
import expo.modules.mpvplayer.cast.receiver.ReceiverServer
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.TransportEngine
import org.json.JSONException
import org.json.JSONObject
import java.util.Locale

// The device proof of the Cast engine, in debug builds only (e2e/suites/cast/README.md, "Cast engine
// probe"): armed by a broadcast, it waits for the first PlayNow JS sends, binds an engine to that
// session and drives each face of it on the TV, while logcat shows what the receiver did. Nothing it
// logs carries a message: the access token rides on every one.

/** The steps, each at its offset from the first playing of the item. */
internal class CastEngineProbeScript(
    private val engine: CastEngine,
    private val server: ReceiverServer,
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
    private val log: (String) -> Unit,
) {
    private val timers = mutableListOf<() -> Unit>()
    private var volumeBefore: Double? = null

    fun run() {
        cancel()
        STEPS.forEach { (atMs, step) -> timers += schedule(atMs) { perform(step) } }
    }

    fun cancel() {
        timers.forEach { it() }
        timers.clear()
    }

    private fun perform(step: String) {
        log("step $step")
        when (step) {
            "pause" -> engine.pause()
            "play" -> engine.play()
            "seek+30" -> engine.seekBy(SEEK_SECONDS)
            "volume-0.1" -> engine.targetVolume?.let {
                volumeBefore = it
                engine.setTargetVolume(it - VOLUME_STEP)
            }
            "volume-back" -> volumeBefore?.let(engine::setTargetVolume)
            // The same track: the receiver reloads for any audio change, under a new play session.
            "audio-reload" -> engine.setAudioTrack(engine.getCurrentAudioTrack())
            "subtitles-off" -> engine.disableSubtitles()
            "capped-reload" -> reloadCapped()
            "next" -> engine.skipToNext()
            "detach" -> engine.stop()
        }
    }

    // A quality change as the engine applies it: the item again where it is, with its source, tracks
    // and queue, under a lower cap.
    private fun reloadCapped() = engine.reloadCurrentItem(server.copy(maxBitrate = CAPPED_BITRATE))

    companion object {
        const val CAPPED_BITRATE = 192_000L
        val STEPS: List<Pair<Long, String>> = listOf(
            5_000L to "pause", 8_000L to "play", 12_000L to "seek+30", 20_000L to "volume-0.1",
            23_000L to "volume-back", 26_000L to "audio-reload", 40_000L to "subtitles-off",
            45_000L to "capped-reload", 60_000L to "seek+30", 70_000L to "next", 80_000L to "detach",
        )
        private const val SEEK_SECONDS = 30.0
        private const val VOLUME_STEP = 0.1
    }
}

/**
 * Arms on the hub: the first PlayNow JS sends names the server and the item, an engine binds to the
 * session, and the script starts at the first playing of that item. One run per arming, which the
 * detach step or a lost binding ends.
 */
internal class CastEngineProbe(
    private val hub: ReceiverChannelHub,
    private val makeEngine: (ReceiverServer) -> CastEngine?,
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
    private val log: (String) -> Unit,
) : TransportEngine.Delegate, CastBindingListener {
    var isActive = false
        private set

    private var captured = false
    private var itemId: String? = null
    private var engine: CastEngine? = null
    private var script: CastEngineProbeScript? = null
    private var bus: ReceiverSubscription? = null
    private var cancelEnd: (() -> Unit)? = null
    private var paused = true
    private var loading = false
    private var started = false

    fun arm() {
        isActive = true
        hub.sendObserver = ::onSend
        log("armed")
    }

    private fun onSend(namespace: String, text: String) {
        if (namespace != ReceiverProtocol.NAMESPACE) return
        val message = try {
            JSONObject(text)
        } catch (_: JSONException) {
            return
        }
        val command = message.optString("command")
        log("bus sent $command")
        if (captured || command != "PlayNow") return
        val server = serverOf(message)
        if (server == null) {
            log("PlayNow without a server")
            return
        }
        captured = true
        itemId = firstItemOf(message)
        // Once the message went: the engine binds to the session JS loads on.
        schedule(0) { bind(server) }
    }

    private fun bind(server: ReceiverServer) {
        val engine = makeEngine(server)
        if (engine == null) {
            log("no Cast engine on this device")
            disarm()
            return
        }
        this.engine = engine
        engine.delegate = this
        engine.bindingListener = this
        script = CastEngineProbeScript(engine, server, schedule, log)
        engine.start(PlayerEngine.Owner.NATIVE_SESSION) {
            bus = hub.subscribe(ReceiverProtocol.NAMESPACE, BusLogger(log))
            log("engine bound, waiting for the item to play")
        }
    }

    // The TV may still show what it played before: the script waits for the item JS loaded.
    private fun startWhenPlaying() {
        val engine = engine ?: return
        if (started || paused || loading || itemId == null || engine.currentItemId != itemId) return
        started = true
        log("item playing, running the script")
        script?.run()
        cancelEnd = schedule(DETACH_AT_MS) { disarm() }
    }

    private fun disarm() {
        if (!isActive) return
        isActive = false
        script?.cancel()
        cancelEnd?.invoke()
        cancelEnd = null
        bus?.remove()
        bus = null
        hub.sendObserver = null
        log("disarmed")
    }

    override fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double) {
        log(String.format(Locale.ROOT, "position %.1f/%.1f", position, duration))
        startWhenPlaying()
    }

    override fun onPauseChanged(isPaused: Boolean) {
        paused = isPaused
        log(if (isPaused) "paused" else "playing")
        startWhenPlaying()
    }

    override fun onLoadingChanged(isLoading: Boolean) {
        loading = isLoading
        log("loading $isLoading")
        startWhenPlaying()
    }

    override fun onReadyToSeek() = log("ready to seek")

    override fun onTracksReady() = Unit

    override fun onError(message: String) {
        log("error $message")
        if (message == CastEngine.NO_SESSION_ERROR) disarm()
    }

    override fun onVideoDimensionsChanged(width: Int, height: Int) = Unit

    override fun onPlaybackEnded() = log("ended")

    override fun onBindingLost(sessionId: String?, error: String?) = disarm()

    // The envelope every message carries, rebuilt and never logged.
    private fun serverOf(message: JSONObject): ReceiverServer? {
        val address = message.optString("serverAddress").ifEmpty { return null }
        val token = message.optString("accessToken").ifEmpty { return null }
        val userId = message.optString("userId").ifEmpty { return null }
        return ReceiverServer(
            serverAddress = address,
            accessToken = token,
            userId = userId,
            receiverName = message.optString("receiverName").ifEmpty { null },
            maxBitrate = message.optLong("maxBitrate").takeIf { it > 0 },
        )
    }

    private fun firstItemOf(message: JSONObject): String? {
        val options = message.optJSONObject("options") ?: return null
        val items = options.optJSONArray("items") ?: return null
        return items.optJSONObject(options.optInt("startIndex", 0))?.optString("Id")?.ifEmpty { null }
    }

    companion object {
        const val ACTION = "expo.modules.mpvplayer.CAST_ENGINE_PROBE"
        private const val TAG = "CastEngineProbe"
        private val DETACH_AT_MS = CastEngineProbeScript.STEPS.first { it.second == "detach" }.first
        private var current: CastEngineProbe? = null

        /** One probe at a time on the app's hub: a broadcast while one runs does nothing. */
        @MainThread
        fun arm(context: Context) {
            if (current?.isActive == true) {
                Log.i(TAG, "already armed")
                return
            }
            val hub = ReceiverChannelHub.shared
            hub.log = { Log.i("ReceiverChannelHub", it) }
            val appContext = context.applicationContext
            current = CastEngineProbe(hub, { CastEngine.create(appContext, it) }, mainLooperSchedule()) { Log.i(TAG, it) }
                .also { it.arm() }
        }
    }
}

/** The receiver's bus as the device proof reads it: the type, and the stream picks of data.PlayState. */
private class BusLogger(private val log: (String) -> Unit) : ReceiverBusListener {
    override fun onMessage(raw: String) {
        val message = try {
            JSONObject(raw)
        } catch (_: JSONException) {
            log("bus message that is not JSON")
            return
        }
        val state = message.optJSONObject("data")?.optJSONObject("PlayState")
        val fields = PLAY_STATE_FIELDS.joinToString(" ") { "$it=${state?.opt(it) ?: "-"}" }
        log("bus type=${message.optString("type")} $fields")
    }

    private companion object {
        val PLAY_STATE_FIELDS = listOf("PlayMethod", "PositionTicks", "AudioStreamIndex", "SubtitleStreamIndex")
    }
}

/** `adb shell am broadcast -n <package>/expo.modules.mpvplayer.cast.engine.CastEngineProbeReceiver -a expo.modules.mpvplayer.CAST_ENGINE_PROBE` */
class CastEngineProbeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == CastEngineProbe.ACTION) CastEngineProbe.arm(context)
    }
}
