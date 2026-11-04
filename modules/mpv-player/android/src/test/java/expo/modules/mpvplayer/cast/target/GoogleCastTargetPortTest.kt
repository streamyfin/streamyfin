package expo.modules.mpvplayer.cast.target

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The SDK half of the hub's port: the SDK calls come in as functions, so what the port asks of
// MediaRouter and the session manager, and what it reports back, is checked without a receiver.
class GoogleCastTargetPortTest {
    private val livingRoom = TargetDevice("device-a", "Living room", "Chromecast")
    private val bedroom = TargetDevice("device-b", "Bedroom", "Google TV Streamer")

    private class Events : TargetPortEvents {
        val sessions = mutableListOf<Triple<String, TargetDevice?, String?>>()
        val deviceLists = mutableListOf<List<TargetDevice>>()

        override fun sessionEvent(event: String, device: TargetDevice?, error: String?) {
            sessions += Triple(event, device, error)
        }

        override fun devicesChanged(devices: List<TargetDevice>) {
            deviceLists += devices
        }
    }

    private class Sdk {
        var routes = listOf<TargetDevice>()
        var disabled = setOf<String>()
        var running: RunningSession? = null
        val selected = mutableListOf<TargetDevice>()
        val ended = mutableListOf<Boolean>()
        var unselects = 0
        val sessionWatches = mutableListOf<((String, TargetDevice?, String?) -> Unit)?>()
        val routeWatches = mutableListOf<(() -> Unit)?>()

        fun port() = GoogleCastTargetPort(
            routes = { routes.map { device -> CastRoute(device, enabled = device.id !in disabled) { selected += device } } },
            runningSession = { running },
            endSession = { stopPlayback -> ended += stopPlayback },
            unselectRoute = { unselects += 1 },
            watchSessions = { relay -> sessionWatches += relay },
            watchRoutes = { onChange -> routeWatches += onChange },
        )
    }

    // Asked back while its session ends, the old route is selected only once the SDK reports that end:
    // selected before, the SDK's cleanup of the old session saw its route selected again, selected the
    // default route over it, and nothing started (seen on the bench, 04/11).
    @Test
    fun aSwitchBackWaitsForTheOldSessionToEndBeforeSelectingItsRoute() {
        val sdk = Sdk().apply {
            routes = listOf(livingRoom, bedroom)
            running = RunningSession(livingRoom, connected = true)
        }
        val port = sdk.port()
        port.start(Events())

        port.connect(bedroom)
        port.connect(livingRoom)
        val beforeTheEnd = sdk.selected.toList()
        sdk.running = null
        sdk.sessionWatches.last()?.invoke("ended", livingRoom, "Cast session status code 2155 (2155)")

        assertEquals(listOf(bedroom), beforeTheEnd)
        assertEquals(listOf(bedroom, livingRoom), sdk.selected)
    }

    @Test
    fun aDisconnectDropsASwitchBackStillWaiting() {
        val sdk = Sdk().apply {
            routes = listOf(livingRoom, bedroom)
            running = RunningSession(livingRoom, connected = true)
        }
        val port = sdk.port()
        port.start(Events())

        port.connect(bedroom)
        port.connect(livingRoom)
        port.disconnect(stopPlayback = true)
        sdk.running = null
        sdk.sessionWatches.last()?.invoke("ended", livingRoom, null)

        assertEquals(listOf(bedroom), sdk.selected)
    }

    @Test
    fun aSessionRunningAtStartIsReportedAsResumed() {
        val sdk = Sdk().apply { running = RunningSession(livingRoom, connected = true) }
        val events = Events()

        sdk.port().start(events)

        assertEquals(listOf(Triple("resumed", livingRoom, null)), events.sessions)
    }

    @Test
    fun aSessionStillConnectingAtStartIsReportedAsResuming() {
        val sdk = Sdk().apply { running = RunningSession(livingRoom, connected = false) }
        val events = Events()

        sdk.port().start(events)

        assertEquals(listOf(Triple("resuming", livingRoom, null)), events.sessions)
    }

    @Test
    fun noSessionAtStartReportsNothing() {
        val events = Events()

        Sdk().port().start(events)

        assertTrue(events.sessions.isEmpty())
    }

    @Test
    fun theSdkSessionCallbacksReachTheHub() {
        val sdk = Sdk()
        val events = Events()
        sdk.port().start(events)

        val relay = sdk.sessionWatches.single()
        assertNotNull(relay)
        relay!!.invoke("ending", livingRoom, null)

        assertEquals(listOf(Triple("ending", livingRoom, null)), events.sessions)
    }

    @Test
    fun connectSelectsTheRouteOfThatDevice() {
        val sdk = Sdk().apply { routes = listOf(livingRoom, bedroom) }
        val port = sdk.port()
        port.start(Events())

        port.connect(bedroom)

        assertEquals(listOf(bedroom), sdk.selected)
    }

    @Test
    fun aDeviceNoLongerRoutedEndsInStartFailed() {
        val sdk = Sdk()
        val events = Events()
        val port = sdk.port()
        port.start(events)

        port.connect(livingRoom)

        assertTrue(sdk.selected.isEmpty())
        assertEquals(listOf(Triple("startFailed", livingRoom, GoogleCastTargetPort.RECEIVER_GONE)), events.sessions)
    }

    // MediaRouter ignores select() on a disabled route: without an answer the hub would stay connecting.
    @Test
    fun aDisabledRouteEndsInStartFailed() {
        val sdk = Sdk().apply {
            routes = listOf(livingRoom)
            disabled = setOf(livingRoom.id)
        }
        val events = Events()
        val port = sdk.port()
        port.start(events)

        port.connect(livingRoom)

        assertTrue(sdk.selected.isEmpty())
        assertEquals(listOf(Triple("startFailed", livingRoom, GoogleCastTargetPort.RECEIVER_BUSY)), events.sessions)
    }

    @Test
    fun disconnectEndsTheRunningSession() {
        val sdk = Sdk().apply { running = RunningSession(livingRoom, connected = true) }
        val events = Events()
        val port = sdk.port()
        port.start(events)

        port.disconnect(stopPlayback = true)

        assertEquals(listOf(true), sdk.ended)
        assertEquals(0, sdk.unselects)
        assertEquals(listOf(Triple("resumed", livingRoom, null)), events.sessions)
    }

    @Test
    fun disconnectBeforeASessionStartedEndsTheRequest() {
        val sdk = Sdk()
        val events = Events()
        val port = sdk.port()
        port.start(events)

        port.disconnect(stopPlayback = false)

        assertTrue(sdk.ended.isEmpty())
        assertEquals(1, sdk.unselects)
        assertEquals(listOf(Triple("ended", null, null)), events.sessions)
    }

    @Test
    fun discoveryListsTheRoutesAndFollowsThem() {
        val sdk = Sdk().apply { routes = listOf(livingRoom) }
        val events = Events()
        val port = sdk.port()
        port.start(events)

        port.startDiscovery()
        port.startDiscovery()
        sdk.routes = listOf(livingRoom, bedroom)
        sdk.routeWatches.single()!!.invoke()

        assertEquals(listOf(listOf(livingRoom), listOf(livingRoom, bedroom)), events.deviceLists)
        assertEquals(listOf(livingRoom, bedroom), port.devices())
    }

    @Test
    fun stopLetsGoOfTheSdk() {
        val sdk = Sdk()
        val port = sdk.port()
        port.start(Events())
        port.startDiscovery()

        port.stop()

        assertNull(sdk.sessionWatches.last())
        assertNull(sdk.routeWatches.last())
    }
}
