package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Test

class MpvOwnershipTest {
    @Test
    fun cancelsQueuedClaims() {
        val first = Any()
        val cancelled = Any()
        val next = Any()
        var acquired = ""

        MpvOwnership.claim(MpvOwnership.Owner.EMBEDDED_VIEW, first) { acquired += "first" }
        MpvOwnership.claim(MpvOwnership.Owner.EMBEDDED_VIEW, cancelled) { acquired += "cancelled" }
        MpvOwnership.claim(MpvOwnership.Owner.NATIVE_SESSION, next) { acquired += "next" }

        MpvOwnership.cancel(cancelled)
        MpvOwnership.release(first)

        assertEquals("firstnext", acquired)
        assertEquals(MpvOwnership.Owner.NATIVE_SESSION, MpvOwnership.owner)
        MpvOwnership.release(next)
    }

    @Test
    fun serializesClaimsAndIgnoresStaleReleases() {
        val first = Any()
        val second = Any()
        var acquired = ""

        MpvOwnership.claim(MpvOwnership.Owner.EMBEDDED_VIEW, first) { acquired += "first" }
        MpvOwnership.claim(MpvOwnership.Owner.EMBEDDED_VIEW, second) { acquired += "second" }

        assertEquals("first", acquired)
        assertEquals(MpvOwnership.Owner.EMBEDDED_VIEW, MpvOwnership.owner)

        MpvOwnership.release(Any())
        assertEquals("first", acquired)

        MpvOwnership.release(first)
        assertEquals("firstsecond", acquired)
        assertEquals(MpvOwnership.Owner.EMBEDDED_VIEW, MpvOwnership.owner)

        MpvOwnership.release(second)
        assertEquals(MpvOwnership.Owner.NONE, MpvOwnership.owner)
    }

    // The native player is the one the viewer asked for (a remote Play, a group starting): it
    // goes before the embedded views waiting, or a preview reopened meanwhile would hold it again.
    @Test
    fun aNativePlayerGoesBeforeTheEmbeddedViewsWaiting() {
        val preview = Any()
        val reopenedPreview = Any()
        val player = Any()
        var acquired = ""

        MpvOwnership.claim(MpvOwnership.Owner.EMBEDDED_VIEW, preview) { acquired += "preview " }
        MpvOwnership.claim(MpvOwnership.Owner.EMBEDDED_VIEW, reopenedPreview) { acquired += "reopened " }
        MpvOwnership.claim(MpvOwnership.Owner.NATIVE_SESSION, player) { acquired += "player " }

        MpvOwnership.release(preview)
        assertEquals("preview player ", acquired)

        MpvOwnership.release(player)
        assertEquals("preview player reopened ", acquired)
        MpvOwnership.release(reopenedPreview)
        assertEquals(MpvOwnership.Owner.NONE, MpvOwnership.owner)
    }

    // A player closing hands the renderer to the next one: they go in turn, nothing preempts.
    @Test
    fun aNativePlayerWaitsForThePlayerBeforeIt() {
        val closing = Any()
        val next = Any()
        var preempted = 0
        var acquired = ""

        MpvOwnership.claim(MpvOwnership.Owner.NATIVE_SESSION, closing, onPreempted = { preempted++ }) { acquired += "closing " }
        MpvOwnership.claim(MpvOwnership.Owner.NATIVE_SESSION, next) { acquired += "next " }

        assertEquals(0, preempted)
        MpvOwnership.release(closing)
        assertEquals("closing next ", acquired)
        MpvOwnership.release(next)
    }

    // A preview under the player held the renderer until its screen went away, which a screen
    // under the player never does: the player stayed on its spinner at 0:00, the clip showing
    // through it.
    @Test
    fun aNativePlayerAsksTheEmbeddedViewToGiveTheRendererUp() {
        val preview = Any()
        val player = Any()
        var preempted = 0
        var acquired = ""

        MpvOwnership.claim(MpvOwnership.Owner.EMBEDDED_VIEW, preview, onPreempted = { preempted++ }) { acquired += "preview " }
        MpvOwnership.claim(MpvOwnership.Owner.NATIVE_SESSION, player) { acquired += "player " }

        assertEquals(1, preempted)
        // The view stops its renderer, which releases the token once mpv is down.
        MpvOwnership.release(preview)
        assertEquals("preview player ", acquired)
        MpvOwnership.release(player)
    }
}
