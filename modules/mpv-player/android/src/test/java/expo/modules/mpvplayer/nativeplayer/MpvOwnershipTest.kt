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
}
