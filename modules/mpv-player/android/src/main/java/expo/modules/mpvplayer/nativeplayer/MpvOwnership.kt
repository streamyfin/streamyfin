package expo.modules.mpvplayer.nativeplayer

import android.util.Log

/**
 * Process-global ownership registry for the libmpv instance.
 *
 * libmpv 1.0 retains native memory on teardown (handles leak to GC by design
 * to avoid an internal use-after-free in libmpv 1.0 nativeDestroy). To prevent
 * multiple simultaneous active players from colliding or causing Out-Of-Memory
 * (OOM) issues, this registry tracks whether an active playback session is owned
 * by the embedded React Native view (MpvPlayerView) or the presented native player
 * session (NativePlayerSession).
 */
object MpvOwnership {
    private const val TAG = "MpvOwnership"

    enum class Owner {
        NONE,
        EMBEDDED_VIEW,
        NATIVE_SESSION,
    }

    @Volatile
    private var currentOwner: Owner = Owner.NONE

    val owner: Owner
        get() = currentOwner

    @Synchronized
    fun claim(newOwner: Owner): Boolean {
        if (currentOwner != Owner.NONE && currentOwner != newOwner) {
            Log.w(TAG, "Ownership claim rejected: currently owned by $currentOwner, requested by $newOwner")
            return false
        }
        currentOwner = newOwner
        Log.i(TAG, "Ownership claimed by $newOwner")
        return true
    }

    @Synchronized
    fun release(ownerToRelease: Owner) {
        if (currentOwner == ownerToRelease) {
            Log.i(TAG, "Ownership released by $ownerToRelease")
            currentOwner = Owner.NONE
        } else {
            Log.w(TAG, "Attempted to release ownership for $ownerToRelease but current owner is $currentOwner")
        }
    }
}
