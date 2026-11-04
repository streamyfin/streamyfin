package expo.modules.mpvplayer.cast.target

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.annotation.MainThread
import com.google.android.gms.cast.framework.CastContext
import expo.modules.mpvplayer.cast.engine.mainLooperSchedule
import java.util.Locale

// The device proof of the remote target, in debug builds only (e2e/suites/cast/README.md, "Remote
// target probe"): armed by a broadcast naming a receiver, it waits for discovery to list it, connects
// through the hub, holds the session, disconnects and waits for none, logging every state on the way.

internal class CastTargetProbe(
    private val hub: RemoteTargetHub,
    private val deviceName: String,
    /** Leaves the session up: the relaunch proof arms a second probe on it. */
    private val keep: Boolean,
    /** How long a connected session is held before the disconnection: long enough to cut the network in. */
    private val holdMs: Long,
    /** Asks the receiver held at the start again right after the switch request: the switch asked back. */
    private val back: Boolean,
    /** False ends the session and leaves the receiver playing, as the output sheet's Disconnect does. */
    private val stop: Boolean,
    /** A level, 0 to 1, set once connected; the receiver's report of it is logged. */
    private val volume: Double?,
    /** A mute, set once connected after the level; the receiver's report of it is logged. */
    private val mute: Boolean?,
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
    private val log: (String) -> Unit,
) : RemoteTargetListener {
    var isActive = false
        private set

    private var removeListener: (() -> Unit)? = null
    private var cancelWait: (() -> Unit)? = null
    private var settle: (() -> Unit)? = null
    private var device: TargetDevice? = null
    private var connected = false
    private var leaving: RemoteTarget? = null
    private var last: RemoteTargetSnapshot? = null

    fun start() {
        isActive = true
        removeListener = hub.addListener(this)
        val current = hub.snapshot
        last = current
        log("armed for \"$deviceName\" ${describe(current)}")
        val target = current.target
        if (current.phase == TargetPhase.CONNECTED) leaving = target
        // A whole name only: a part of one may name another receiver than the connected one.
        if (current.phase == TargetPhase.CONNECTED && target != null && target.name.equals(deviceName, ignoreCase = true)) {
            log("already connected to ${target.name}")
            // The session the probe holds, for the hold's check.
            device = TargetDevice(target.id, target.name)
            onConnected()
            return
        }
        // Set first: the SDK port lists the routes it has inside startDiscovery, and a connection
        // started there sets its own wait, which this one must not replace.
        wait(DISCOVERY_TIMEOUT_MS, "no device named \"$deviceName\"")
        hub.startDiscovery(RemoteTargetHub.PROBE_DISCOVERY)
        devicesChanged(hub.devices)
    }

    override fun devicesChanged(devices: List<TargetDevice>) {
        if (!isActive || device != null) return
        // A whole name connects at once. A part of one waits: iOS lists receivers one at a time, and on
        // the bench "Salon" may come after "Salon - Chromecast".
        devices.firstOrNull { it.name.equals(deviceName, ignoreCase = true) }?.let {
            connect(it)
            return
        }
        if (settle == null && devices.any { matches(it.name) }) {
            settle = schedule(PARTIAL_MATCH_SETTLE_MS) {
                // Spent either way: a receiver that left meanwhile can settle again when it comes back.
                settle = null
                val listed = hub.devices
                (listed.firstOrNull { it.name.equals(deviceName, ignoreCase = true) } ?: listed.firstOrNull { matches(it.name) })
                    ?.let(::connect)
            }
        }
    }

    private fun connect(found: TargetDevice) {
        if (!isActive || device != null) return
        settle?.invoke()
        settle = null
        device = found
        log("found ${found.name}")
        val left = leaving?.takeIf { back && it.id != found.id }
        // Asking back needs the receiver it leaves in the list, or the switch would run with nothing after it.
        if (left != null && hub.devices.none { it.id == left.id }) {
            fail("${left.name} is not listed, nothing to go back to")
            return
        }
        if (!hub.connect(found.id)) {
            fail("the hub refused ${found.name}")
            return
        }
        // A refusal can end the probe inside the request.
        if (!isActive) return
        if (left != null) {
            // Before the switch has ended the held session: the last request must win.
            log("asking ${left.name} again")
            device = TargetDevice(left.id, left.name)
            if (!hub.connect(left.id)) {
                fail("the hub refused ${left.name}")
                return
            }
            wait(CONNECT_TIMEOUT_MS, "never connected")
            return
        }
        // The hub asks nothing for the receiver already connected, so no event will come.
        val now = hub.snapshot
        if (!connected && now.phase == TargetPhase.CONNECTED && now.target?.id == found.id) {
            log("already connected to ${found.name}")
            onConnected()
            return
        }
        if (!connected && isActive) wait(CONNECT_TIMEOUT_MS, "never connected")
    }

    override fun targetChanged(snapshot: RemoteTargetSnapshot) {
        if (!isActive) return
        val previous = last
        last = snapshot
        // A volume report alone moves nothing the proof waits for: one line with the level.
        if (previous != null && snapshot.copy(volume = previous.volume, muted = previous.muted) == previous) {
            log("volume=${level(snapshot.volume)} muted=${snapshot.muted}")
            return
        }
        log(describe(snapshot))
        when (snapshot.phase) {
            // Only the receiver it found: the SDK can resume another session meanwhile, after a relaunch.
            TargetPhase.CONNECTED -> when {
                !connected && device != null && snapshot.target?.id == device?.id -> onConnected()
                // A switch the port refused at once: the receiver holding the session stays, with the cause.
                !connected && device != null && snapshot.error != null -> fail("connection failed error=${snapshot.error}")
            }
            // A none without an error before the connection is a switch's old session ending: the
            // asked receiver comes next, or the connection wait says it never did.
            TargetPhase.NONE -> when {
                connected -> finish("done")
                device != null && snapshot.error != null -> fail("connection failed error=${snapshot.error}")
            }
            else -> Unit
        }
    }

    private fun onConnected() {
        connected = true
        cancelWait?.invoke()
        volume?.let {
            log("setting the volume to ${level(it)}")
            hub.setVolume(it)
        }
        mute?.let {
            log("setting the mute to $it")
            hub.setMuted(it)
        }
        if (keep) {
            finish("done, still connected")
            return
        }
        cancelWait = schedule(holdMs) {
            // Another receiver took the session meanwhile: it is not the probe's to end.
            val holder = hub.snapshot.target
            if (holder?.id != device?.id) {
                fail("the session went to ${holder?.name ?: "none"}")
                return@schedule
            }
            log(if (stop) "disconnecting" else "disconnecting without stopping the receiver")
            wait(END_TIMEOUT_MS, "never ended")
            hub.disconnect(stopPlayback = stop)
        }
    }

    private fun matches(name: String) = name.contains(deviceName, ignoreCase = true)

    private fun wait(delayMs: Long, failure: String) {
        cancelWait?.invoke()
        cancelWait = schedule(delayMs) { fail(failure) }
    }

    private fun fail(reason: String) = finish("failed: $reason")

    private fun finish(result: String) {
        if (!isActive) return
        isActive = false
        cancelWait?.invoke()
        cancelWait = null
        settle?.invoke()
        settle = null
        removeListener?.invoke()
        removeListener = null
        hub.stopDiscovery(RemoteTargetHub.PROBE_DISCOVERY)
        log(result)
    }

    companion object {
        const val ACTION = "expo.modules.mpvplayer.CAST_TARGET_PROBE"
        const val DISCOVERY_TIMEOUT_MS = 15_000L
        const val PARTIAL_MATCH_SETTLE_MS = 3_000L
        // Longer than the SDK's own connection timeout, which answers startFailed first.
        const val CONNECT_TIMEOUT_MS = 30_000L
        const val CONNECTED_HOLD_MS = 5_000L
        const val END_TIMEOUT_MS = 20_000L
        private const val TAG = "CastTargetProbe"
        private var current: CastTargetProbe? = null

        fun level(volume: Double?) = volume?.let { String.format(Locale.ROOT, "%.2f", it) } ?: "-"

        fun describe(snapshot: RemoteTargetSnapshot) =
            "state=${snapshot.phase.jsName} target=${snapshot.target?.name ?: "-"} " +
                "reconnecting=${snapshot.reconnecting} error=${snapshot.error ?: "-"}"

        /** One probe at a time: a broadcast while one runs does nothing. */
        @MainThread
        fun run(
            context: Context,
            deviceName: String,
            keep: Boolean,
            holdMs: Long,
            back: Boolean,
            stop: Boolean,
            volume: Double?,
            mute: Boolean?,
        ) {
            if (current?.isActive == true) {
                Log.i(TAG, "already running")
                return
            }
            if (deviceName.isBlank()) {
                Log.i(TAG, "failed: no device name, pass --es device <part of its name>")
                return
            }
            val cast = try {
                CastContext.getSharedInstance(context.applicationContext)
            } catch (error: RuntimeException) {
                Log.w(TAG, "failed: no Cast context", error)
                return
            }
            // The module installs the same port when JS first touches Cast; whichever comes first wins.
            RemoteTargets.installDefault(context, cast)
            current =
                CastTargetProbe(RemoteTargetHub.shared, deviceName, keep, holdMs, back, stop, volume, mute, mainLooperSchedule()) {
                    Log.i(TAG, it)
                }.also { it.start() }
        }
    }
}

/**
 * `adb shell am broadcast -n <package>/expo.modules.mpvplayer.cast.target.CastTargetProbeReceiver -a expo.modules.mpvplayer.CAST_TARGET_PROBE --es device <name> [--ez keep true] [--el hold <ms>] [--ez back true] [--ez stop false] [--ef volume <0 to 1>] [--ez mute true|false]`
 */
class CastTargetProbeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != CastTargetProbe.ACTION) return
        CastTargetProbe.run(
            context,
            intent.getStringExtra("device").orEmpty(),
            intent.getBooleanExtra("keep", false),
            intent.getLongExtra("hold", CastTargetProbe.CONNECTED_HOLD_MS),
            intent.getBooleanExtra("back", false),
            intent.getBooleanExtra("stop", true),
            if (intent.hasExtra("volume")) intent.getFloatExtra("volume", 0f).toDouble() else null,
            if (intent.hasExtra("mute")) intent.getBooleanExtra("mute", false) else null,
        )
    }
}
