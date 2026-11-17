package expo.modules.mpvplayer.cast

import android.content.Context
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import expo.modules.mpvplayer.DeviceKind

/**
 * Whether this device can cast at all. Android TV links the SDK like every other build
 * (Gradle does not know it builds for a TV) but never uses it, and a phone without Play
 * Services has no Cast API; both answer false and the JS side does nothing.
 */
object CastSupport {
    fun playServicesState(context: Context): Int =
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)

    fun isAvailable(context: Context): Boolean =
        !DeviceKind.isTelevision(context) && playServicesState(context) == ConnectionResult.SUCCESS
}
