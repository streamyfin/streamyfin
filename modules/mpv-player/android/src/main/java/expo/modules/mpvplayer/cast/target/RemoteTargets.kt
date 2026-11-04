package expo.modules.mpvplayer.cast.target

import android.content.Context
import androidx.annotation.MainThread
import com.google.android.gms.cast.framework.CastContext
import expo.modules.mpvplayer.BuildConfig
import expo.modules.mpvplayer.cast.engine.mainLooperSchedule

/** Gives the shared hub its port, once per Cast context: every module instance and the debug probe come through here. */
object RemoteTargets {
    /** Set by `-PstreamyfinFakeCastDevices=true` for tier 1 builds (e2e/README.md); no store build sets it. */
    val fakeDevices: Boolean = BuildConfig.FAKE_CAST_DEVICES

    private var installedFor: CastContext? = null

    @MainThread
    fun installDefault(context: Context, cast: CastContext, hub: RemoteTargetHub = RemoteTargetHub.shared) {
        if (installedFor === cast) return
        installedFor = cast
        hub.install(portFor(fakeDevices, { GoogleCastTargetPort.of(context, cast) }, mainLooperSchedule()))
    }

    /** The fake receivers in a build that asked for them, the Cast SDK everywhere else. */
    internal fun portFor(fake: Boolean, real: () -> TargetPort, schedule: (Long, () -> Unit) -> (() -> Unit)): TargetPort =
        if (fake) FakeCastDevices(schedule) else real()
}
