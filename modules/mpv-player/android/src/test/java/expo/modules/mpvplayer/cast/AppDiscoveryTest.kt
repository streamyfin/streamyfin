package expo.modules.mpvplayer.cast

import org.junit.Assert.assertEquals
import org.junit.Test

// The app's discovery runs while JS asks for it and the activity is in the foreground: a request made in
// the background used to start an active scan that nothing stopped until the next pause.
class AppDiscoveryTest {
    private var starts = 0
    private var stops = 0
    private val discovery = AppDiscovery(start = { starts += 1 }, stop = { stops += 1 })

    @Test
    fun aRequestInTheBackgroundWaitsForTheForeground() {
        discovery.background()
        discovery.want()
        assertEquals(0, starts)

        discovery.foreground()
        assertEquals(1, starts)
    }

    @Test
    fun theBackgroundPausesAndTheForegroundResumesARequest() {
        discovery.want()
        discovery.background()
        discovery.foreground()

        assertEquals(2, starts)
        assertEquals(1, stops)
    }

    @Test
    fun aReleasedRequestStaysOffInTheForeground() {
        discovery.want()
        discovery.release()
        discovery.background()
        discovery.foreground()

        assertEquals(1, starts)
        assertEquals(1, stops)
    }
}
