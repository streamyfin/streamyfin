package expo.modules.mpvplayer.nativeplayer.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeSyncPlayActionTest {
    @Test
    fun mapsEveryWireActionToItsDistinctControlIcon() {
        val icons = mapOf(
            "schedule-play" to "Filled.Sync",
            "unpause" to "Outlined.PlayCircleOutline",
            "pause" to "Outlined.PauseCircleOutline",
            "seek" to "Outlined.Refresh",
            "buffering" to "Outlined.AccessTime",
            "wait-pause" to "Outlined.AccessTime",
            "wait-unpause" to "Outlined.AccessTime"
        )
        assertEquals(icons.keys, NativeSyncPlayAction.entries.map { it.wireValue }.toSet())
        icons.forEach { (wireValue, icon) ->
            assertEquals(icon, NativeSyncPlayAction.fromWire(wireValue)?.primary?.name)
        }
    }

    @Test
    fun keepsThePlayBadgeStillInTheSpinningScheduleRing() {
        val action = NativeSyncPlayAction.SCHEDULE_PLAY
        assertEquals("Filled.PlayArrow", action.secondary?.name)
        assertTrue(action.centered)
        assertTrue(action.spin)
        assertTrue(action.repeatsPulse)
    }

    @Test
    fun distinguishesPendingPauseFromPendingPlayWithCornerBadges() {
        val pause = NativeSyncPlayAction.WAIT_PAUSE
        val play = NativeSyncPlayAction.WAIT_UNPAUSE
        assertEquals("Filled.Pause", pause.secondary?.name)
        assertEquals("Filled.PlayArrow", play.secondary?.name)
        for (action in listOf(pause, play)) {
            assertFalse(action.centered)
            assertFalse(action.spin)
            assertTrue(action.repeatsPulse)
        }
    }

    @Test
    fun confirmationsPulseOnceAndClearedStateUsesTheLocalFallback() {
        assertFalse(NativeSyncPlayAction.PAUSE.repeatsPulse)
        assertFalse(NativeSyncPlayAction.UNPAUSE.repeatsPulse)
        assertNull(NativeSyncPlayAction.fromWire(null))
        assertNull(NativeSyncPlayAction.fromWire("unknown"))
    }
}
