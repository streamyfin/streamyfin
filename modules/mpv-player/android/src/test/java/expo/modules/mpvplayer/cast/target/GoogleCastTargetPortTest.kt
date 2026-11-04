package expo.modules.mpvplayer.cast.target

import expo.modules.mpvplayer.cast.engine.ManualScheduler
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
        val volumes = mutableListOf<Pair<Double, Boolean>>()
        val codes = mutableListOf<Int?>()

        override fun sessionEvent(event: String, device: TargetDevice?, error: String?) {
            sessions += Triple(event, device, error)
        }

        override fun sessionEvent(event: String, device: TargetDevice?, error: String?, code: Int?) {
            sessionEvent(event, device, error)
            codes += code
        }

        override fun volumeChanged(level: Double, muted: Boolean) {
            volumes += level to muted
        }

        override fun devicesChanged(devices: List<TargetDevice>) {
            deviceLists += devices
        }
    }

    private class Sdk {
        val scheduler = ManualScheduler()
        var routes = listOf<TargetDevice>()
        var disabled = setOf<String>()
        var running: RunningSession? = null
        val selected = mutableListOf<TargetDevice>()
        val ended = mutableListOf<Boolean>()
        var unselects = 0
        val sessionWatches = mutableListOf<((String, TargetDevice?, String?, Int?) -> Unit)?>()
        val routeWatches = mutableListOf<(() -> Unit)?>()
        var volume: Pair<Double, Boolean>? = null
        val volumesSet = mutableListOf<Double>()
        val mutesSet = mutableListOf<Boolean>()
        val volumeWatches = mutableListOf<((Double, Boolean) -> Unit)?>()

        fun port() = GoogleCastTargetPort(
            routes = { routes.map { device -> CastRoute(device, enabled = device.id !in disabled) { selected += device } } },
            runningSession = { running },
            endSession = { stopPlayback -> ended += stopPlayback },
            unselectRoute = { unselects += 1 },
            watchSessions = { relay -> sessionWatches += relay },
            watchRoutes = { onChange -> routeWatches += onChange },
            schedule = scheduler.schedule,
            sessionVolume = { volume },
            setSessionVolume = { level -> volumesSet += level },
            setSessionMuted = { muted -> mutesSet += muted },
            watchVolume = { relay -> volumeWatches += relay },
        )
    }

    // Asked back while its session ends, the old route is selected only after the SDK has finished with
    // that session: its cleanup selects the default route when the ended session's route is selected at
    // that moment, after the listeners, so a route selected before, or inside the end callback, lost to
    // it and nothing started (seen on the bench, 04/11). The selection waits for the next main loop turn.
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
        sdk.sessionWatches.last()?.invoke("ended", livingRoom, "Cast session status code 2155 (2155)", 2155)
        val inTheEndCallback = sdk.selected.toList()
        sdk.scheduler.advance(0)

        assertEquals(listOf(bedroom), beforeTheEnd)
        assertEquals(listOf(bedroom), inTheEndCallback)
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
        sdk.running = null
        sdk.sessionWatches.last()?.invoke("ended", livingRoom, null, null)
        port.disconnect(stopPlayback = true)
        sdk.scheduler.advance(0)

        assertEquals(listOf(bedroom), sdk.selected)
    }

    @Test
    fun theSessionVolumeIsReadAtStart() {
        val sdk = Sdk().apply {
            running = RunningSession(livingRoom, connected = true)
            volume = 0.3 to false
        }
        val events = Events()

        sdk.port().start(events)

        assertEquals(listOf(0.3 to false), events.volumes)
    }

    @Test
    fun aStartedSessionReportsItsVolume() {
        val sdk = Sdk()
        val events = Events()
        sdk.port().start(events)

        sdk.volume = 0.8 to true
        sdk.sessionWatches.last()?.invoke("started", livingRoom, null, null)

        assertEquals(listOf(0.8 to true), events.volumes)
    }

    @Test
    fun aVolumeChangeFromTheSdkIsForwarded() {
        val sdk = Sdk()
        val events = Events()
        sdk.port().start(events)

        sdk.volumeWatches.last()?.invoke(0.7, true)

        assertEquals(listOf(0.7 to true), events.volumes)
    }

    @Test
    fun aVolumeSetReachesTheSession() {
        val sdk = Sdk().apply { running = RunningSession(livingRoom, connected = true) }
        val port = sdk.port()
        port.start(Events())

        port.setVolume(0.4)
        port.setMuted(true)

        assertEquals(listOf(0.4), sdk.volumesSet)
        assertEquals(listOf(true), sdk.mutesSet)
    }

    @Test
    fun anEndCarriesTheSdkCode() {
        val sdk = Sdk()
        val events = Events()
        sdk.port().start(events)

        sdk.sessionWatches.last()?.invoke("ended", livingRoom, "Cast session status code 2155 (2155)", 2155)

        assertEquals(listOf<Int?>(2155), events.codes)
    }

    // The sheet's icon: a TV for a receiver with a screen, a speaker for one without.
    @Test
    fun aDeviceWithoutVideoOutSaysSo() {
        val speaker = GoogleCastTargetPort.device("id-s", null, "Google Home", videoOut = false)

        assertEquals(false, speaker.videoOut)
        assertEquals("", speaker.name)
        assertEquals(false, speaker.toMap()["videoOut"])
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
        relay!!.invoke("ending", livingRoom, null, null)

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
