package expo.modules.mpvplayer.cast.target

import android.content.Context
import android.util.Log
import androidx.annotation.MainThread
import com.google.android.gms.cast.framework.CastContext
import expo.modules.mpvplayer.BuildConfig
import expo.modules.mpvplayer.cast.engine.mainLooperSchedule

/** Gives the shared hub its port, once per Cast context: every module instance and the debug probe come through here. */
object RemoteTargets {
    /** Set by `-PstreamyfinFakeCastDevices=true` for tier 1 builds (e2e/README.md); store profiles refuse it. */
    val fakeDevices: Boolean = BuildConfig.FAKE_CAST_DEVICES

    const val FAKE_RECEIVERS_WARNING = "Fake Cast receivers in place of the Cast SDK's: this is a tier 1 build"
    private const val TAG = "StreamyfinCast"

    private var installedFor: CastContext? = null

    @MainThread
    fun installDefault(context: Context, cast: CastContext, hub: RemoteTargetHub = RemoteTargetHub.shared) {
        if (installedFor === cast) return
        installedFor = cast
        hub.install(portFor(fakeDevices, { GoogleCastTargetPort.of(context, cast) }, mainLooperSchedule()) { Log.w(TAG, it) })
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
