package expo.modules.mpvplayer.cast.target

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.MainThread
import com.google.android.gms.cast.framework.CastContext
import expo.modules.mpvplayer.BuildConfig
import expo.modules.mpvplayer.cast.engine.CastEngine
import expo.modules.mpvplayer.cast.engine.create
import expo.modules.mpvplayer.cast.engine.mainLooperSchedule
import expo.modules.mpvplayer.cast.playback.RemotePlayback
import expo.modules.mpvplayer.nativeplayer.remote.FakeRemoteEngine

/** Gives the shared hub its port, once per Cast context: every module instance and the debug probe come through here. */
object RemoteTargets {
    /** Set by `-PstreamyfinFakeCastDevices=true` for tier 1 builds (e2e/README.md); store profiles refuse it. */
    val fakeDevices: Boolean = BuildConfig.FAKE_CAST_DEVICES

    const val FAKE_RECEIVERS_WARNING = "Fake Cast receivers in place of the Cast SDK's: this is a tier 1 build"
    private const val TAG = "StreamyfinCast"

    private var installedFor: CastContext? = null
    private var playbackWired = false

    @MainThread
    fun installDefault(context: Context, cast: CastContext, hub: RemoteTargetHub = RemoteTargetHub.shared) {
        if (installedFor === cast) return
        installedFor = cast
        hub.log = { Log.w(TAG, it) }
        hub.install(portFor(fakeDevices, { GoogleCastTargetPort.of(context, cast) }, mainLooperSchedule()) { Log.w(TAG, it) })
        wirePlayback(context, hub)
    }

    // The holder of the remote engine follows the hub's session, once per process: the SDK's engine, or the
    // fake one for the fake receivers. It makes none until JS gives it a server.
    @MainThread
    private fun wirePlayback(context: Context, hub: RemoteTargetHub) {
        if (playbackWired) return
        playbackWired = true
        val playback = RemotePlayback.shared
        val main = Handler(Looper.getMainLooper())
        playback.useFactory(
            RemotePlayback.factoryFor(
                fake = fakeDevices,
                real = { server -> CastEngine.create(context, server) },
                fakeEngine = {
                    FakeRemoteEngine(mainLooperSchedule(), { block -> if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block) })
                },
            ),
        )
        val follow = { snapshot: RemoteTargetSnapshot ->
            val (connected, suspended) = RemotePlayback.sessionOf(snapshot)
            playback.targetChanged(connected, suspended)
        }
        hub.addListener(object : RemoteTargetListener {
            override fun targetChanged(snapshot: RemoteTargetSnapshot) = follow(snapshot)
            override fun devicesChanged(devices: List<TargetDevice>) = Unit
        })
        follow(hub.snapshot)
    }

    /** The fake receivers in a build that asked for them, said out loud, and the Cast SDK everywhere else. */
    internal fun portFor(
        fake: Boolean,
        real: () -> TargetPort,
        schedule: (Long, () -> Unit) -> (() -> Unit),
        warn: (String) -> Unit,
    ): TargetPort {
        if (!fake) return real()
        warn(FAKE_RECEIVERS_WARNING)
        return FakeCastDevices(schedule)
    }
}
