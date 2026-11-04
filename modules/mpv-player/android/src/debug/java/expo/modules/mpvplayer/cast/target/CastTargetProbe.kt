package expo.modules.mpvplayer.cast.target

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.annotation.MainThread
import com.google.android.gms.cast.framework.CastContext
import expo.modules.mpvplayer.cast.engine.mainLooperSchedule

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

    fun start() {
        isActive = true
        removeListener = hub.addListener(this)
        val current = hub.snapshot
        log("armed for \"$deviceName\" ${describe(current)}")
        val target = current.target
        if (current.phase == TargetPhase.CONNECTED) leaving = target
        // A whole name only: a part of one may name another receiver than the connected one.
        if (current.phase == TargetPhase.CONNECTED && target != null && target.name.equals(deviceName, ignoreCase = true)) {
            log("already connected to ${target.name}")
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
        if (!hub.connect(found.id)) {
            fail("the hub refused ${found.name}")
            return
        }
        val left = leaving
        if (back && left != null && left.id != found.id) {
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
        log(describe(snapshot))
        when (snapshot.phase) {
            // Only the receiver it found: the SDK can resume another session meanwhile, after a relaunch.
            TargetPhase.CONNECTED -> if (!connected && device != null && snapshot.target?.id == device?.id) onConnected()
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
        if (keep) {
            finish("done, still connected")
            return
        }
        cancelWait = schedule(holdMs) {
            log("disconnecting")
            wait(END_TIMEOUT_MS, "never ended")
            hub.disconnect(stopPlayback = true)
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

        fun describe(snapshot: RemoteTargetSnapshot) =
            "state=${snapshot.phase.jsName} target=${snapshot.target?.name ?: "-"} " +
                "reconnecting=${snapshot.reconnecting} error=${snapshot.error ?: "-"}"

        /** One probe at a time: a broadcast while one runs does nothing. */
        @MainThread
        fun run(context: Context, deviceName: String, keep: Boolean, holdMs: Long, back: Boolean) {
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
            current = CastTargetProbe(RemoteTargetHub.shared, deviceName, keep, holdMs, back, mainLooperSchedule()) { Log.i(TAG, it) }
                .also { it.start() }
        }
    }
}

/** `adb shell am broadcast -n <package>/expo.modules.mpvplayer.cast.target.CastTargetProbeReceiver -a expo.modules.mpvplayer.CAST_TARGET_PROBE --es device <name> [--ez keep true] [--el hold <ms>] [--ez back true]` */
class CastTargetProbeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != CastTargetProbe.ACTION) return
        CastTargetProbe.run(
            context,
            intent.getStringExtra("device").orEmpty(),
            intent.getBooleanExtra("keep", false),
            intent.getLongExtra("hold", CastTargetProbe.CONNECTED_HOLD_MS),
            intent.getBooleanExtra("back", false),
        )
    }
}
