package expo.modules.mpvplayer.cast.target

import expo.modules.mpvplayer.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeFalse
import org.junit.Test

// A store build must reach the real receivers: the fake ones exist only when the build asked for
// them with -PstreamyfinFakeCastDevices=true, which Gradle also hands the tests as a system property.
class FakeCastDevicesWiringTest {
    private val askedForFakes = System.getProperty("streamyfinFakeCastDevices") == "true"
    private val schedule: (Long, () -> Unit) -> (() -> Unit) = { _, _ -> {} }

    @Test
    fun theBuildHasFakeDevicesOnlyWhenItAskedForThem() {
        assertEquals(askedForFakes, BuildConfig.FAKE_CAST_DEVICES)
        assertEquals(BuildConfig.FAKE_CAST_DEVICES, RemoteTargets.fakeDevices)
    }

    @Test
    fun aBuildThatDidNotAskHasNone() {
        assumeFalse(askedForFakes)

        assertFalse(RemoteTargets.fakeDevices)
    }

    @Test
    fun theRealPortUnlessTheBuildAskedForFakes() {
        val real = FakeTargetPort()
        val warnings = mutableListOf<String>()

        assertSame(real, RemoteTargets.portFor(fake = false, real = { real }, schedule = schedule, warn = warnings::add))
        assertTrue(warnings.isEmpty())
        assertTrue(RemoteTargets.portFor(fake = true, real = { real }, schedule = schedule, warn = warnings::add) is FakeCastDevices)
        // A build that should not have them shows it in the device log.
        assertEquals(listOf(RemoteTargets.FAKE_RECEIVERS_WARNING), warnings)
    }
}
