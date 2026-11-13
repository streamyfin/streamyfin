package expo.modules.mpvplayer.nativeplayer

/**
 * Process-global ownership registry for libmpv renderers.
 *
 * A renderer keeps its token until asynchronous decoder teardown completes.
 * Replacement renderers wait for that release instead of overlapping native
 * handles or failing during rapid navigation.
 *
 * The native player comes first: it is what the viewer asked for (a remote
 * Play, a group starting), where an embedded view is a decorative preview. Its
 * claim goes ahead of the views waiting, and asks the view holding the
 * renderer to give it up. Without that, a preview on a screen under the
 * player held it for as long as that screen stayed, and the player never
 * started.
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
        val onPreempted: (() -> Unit)?,
        val onAcquired: () -> Unit,
    )

    private var currentClaim: Claim? = null
    private val pendingClaims = mutableListOf<Claim>()

    val owner: Owner
        @Synchronized get() = currentClaim?.owner ?: Owner.NONE

    /**
     * [onPreempted] runs when a native player wants the renderer this claim
     * holds: the holder stops its renderer, which releases the token. Only an
     * embedded view is asked; a player hands over in turn.
     */
    fun claim(
        owner: Owner,
        token: Any,
        onPreempted: (() -> Unit)? = null,
        onAcquired: () -> Unit,
    ) {
        var preempt: (() -> Unit)? = null
        val acquired = synchronized(this) {
            val claim = Claim(owner, token, onPreempted, onAcquired)
            val current = currentClaim
            if (current == null) {
                currentClaim = claim
                return@synchronized true
            }
            if (owner == Owner.NATIVE_SESSION) {
                val firstView = pendingClaims.indexOfFirst { it.owner == Owner.EMBEDDED_VIEW }
                pendingClaims.add(if (firstView < 0) pendingClaims.size else firstView, claim)
                if (current.owner == Owner.EMBEDDED_VIEW) preempt = current.onPreempted
            } else {
                pendingClaims.add(claim)
            }
            false
        }

        if (acquired) onAcquired()
        preempt?.invoke()
    }

    @Synchronized
    fun cancel(token: Any) {
        pendingClaims.removeAll { it.token === token }
    }

    fun release(token: Any) {
        val nextClaim = synchronized(this) {
            val current = currentClaim
            if (current?.token !== token) return

            val next = pendingClaims.removeFirstOrNull()
            currentClaim = next
            next
        }

        nextClaim?.onAcquired?.invoke()
    }
}
