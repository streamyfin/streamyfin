package expo.modules.mpvplayer.nativeplayer

import java.util.ArrayDeque

/**
 * Process-global ownership registry for libmpv renderers.
 *
 * A renderer keeps its token until asynchronous decoder teardown completes.
 * Replacement renderers wait for that release instead of overlapping native
 * handles or failing during rapid navigation.
 */
object MpvOwnership {
    enum class Owner {
        NONE,
        EMBEDDED_VIEW,
        NATIVE_SESSION,
    }

    private data class Claim(
        val owner: Owner,
        val token: Any,
        val onAcquired: () -> Unit,
    )

    private var currentClaim: Claim? = null
    private val pendingClaims = ArrayDeque<Claim>()

    val owner: Owner
        @Synchronized get() = currentClaim?.owner ?: Owner.NONE

    fun claim(owner: Owner, token: Any, onAcquired: () -> Unit) {
        val acquired = synchronized(this) {
            val claim = Claim(owner, token, onAcquired)
            if (currentClaim == null) {
                currentClaim = claim
                true
            } else {
                pendingClaims.addLast(claim)
                false
            }
        }

        if (acquired) onAcquired()
    }

    @Synchronized
    fun cancel(token: Any) {
        pendingClaims.removeAll { it.token === token }
    }

    fun release(token: Any) {
        val nextClaim = synchronized(this) {
            val current = currentClaim
            if (current?.token !== token) return

            val next = pendingClaims.pollFirst()
            currentClaim = next
            next
        }

        nextClaim?.onAcquired?.invoke()
    }
}
