package expo.modules.mpvplayer.cast.target

import android.content.Context
import androidx.annotation.MainThread
import com.google.android.gms.cast.framework.CastContext

/** Gives the shared hub its port, once per Cast context: every module instance and the debug probe come through here. */
object RemoteTargets {
    private var installedFor: CastContext? = null

    @MainThread
    fun installDefault(context: Context, cast: CastContext, hub: RemoteTargetHub = RemoteTargetHub.shared) {
        if (installedFor === cast) return
        installedFor = cast
        hub.install(GoogleCastTargetPort.of(context, cast))
    }
}
