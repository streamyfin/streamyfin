package expo.modules.mpvplayer.nativeplayer

import android.os.Looper
import android.view.KeyEvent
import expo.modules.mpvplayer.MPVLayerRenderer
import expo.modules.mpvplayer.MpvLoadGenerations
import expo.modules.mpvplayer.mpvStartOption
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.VideoLoadConfig
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * Live TV in the native player. The JS player's Android view knew a channel
 * from a film; once Live TV played here instead, a channel opened as a film:
 * a bar over the few seconds read so far, an end time, and seeks offered on
 * screen, to a headset and on the lock screen.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LiveStreamTest {
    private val engineCalls = mutableListOf<String>()

    private fun seeks() = engineCalls.filter { it.startsWith("seek") }

    /** An engine that only notes what it is asked. */
    private val engine = Proxy.newProxyInstance(
        PlayerEngine::class.java.classLoader,
        arrayOf(PlayerEngine::class.java),
    ) { _, method, _ ->
        engineCalls += method.name
        when (method.returnType) {
            java.lang.Boolean.TYPE -> false
            java.lang.Integer.TYPE -> 0
            java.lang.Double.TYPE -> 0.0
            else -> null
        }
    } as PlayerEngine

    private fun config(live: Boolean) = PlayerPresentConfigRecord().apply {
        stream = StreamConfigRecord().apply {
            url = "https://server/stream"
            isLive = live
        }
        metadata = MetadataRecord().apply {
            itemId = if (live) "channel" else "film"
            title = if (live) "A channel" else "A film"
        }
        ui = UIOptionsRecord().apply { doubleTapToSeekEnabled = true }
    }

    private fun player(live: Boolean) = PlayerViewModel().also {
        it.engine = engine
        it.apply(config(live))
    }

    // Every seek ends in seekLocal: the on-screen and remote skips, a headset,
    // the lock screen, the picture in picture window, a Seek from another device.
    @Test
    fun aLiveStreamIsNotSought() {
        val viewModel = player(live = true)

        viewModel.seekTo(30.0)
        viewModel.seekBy(-10.0)
        viewModel.seekLocal(0.0)

        assertEquals(emptyList<String>(), seeks())
    }

    // In a group a seek goes to the group, not to the engine: the guard in
    // seekLocal never sees it, and the group seeks everyone on the channel.
    @Test
    fun aLiveStreamInAGroupAsksTheGroupForNoSeek() {
        val viewModel = player(live = true)
        val actions = mutableListOf<Any?>()
        viewModel.emit = { name, payload ->
            if (name == "onSyncPlayAction") actions += payload["action"]
        }
        viewModel.updateSyncPlay(SyncPlayStateRecord().apply {
            groupId = "group"
            connected = true
        })

        viewModel.seekTo(30.0)

        assertEquals(emptyList<Any?>(), actions)
    }

    @Test
    fun aFilmInAGroupAsksTheGroupToSeek() {
        val viewModel = player(live = false)
        val actions = mutableListOf<Any?>()
        viewModel.emit = { name, payload ->
            if (name == "onSyncPlayAction") actions += payload["action"]
        }
        viewModel.updateSyncPlay(SyncPlayStateRecord().apply {
            groupId = "group"
            connected = true
        })

        viewModel.seekTo(30.0)

        assertEquals(listOf<Any?>("seek"), actions)
    }

    @Test
    fun aFilmIsSought() {
        val viewModel = player(live = false)

        viewModel.seekTo(30.0)

        assertEquals(listOf("seekToTracked"), seeks())
    }

    // A remote Play can put a film where a channel was, in the same player.
    @Test
    fun aFilmOpenedAfterAChannelIsSoughtAgain() {
        val viewModel = player(live = true)

        viewModel.prepareForReload()
        viewModel.apply(config(live = false))
        viewModel.seekTo(30.0)

        assertEquals(listOf("seekToTracked"), seeks())
    }

    // mpv gives as a live stream's duration how far it has read, which grows
    // with every tick. Each new value republished the session's metadata and
    // the notification, some 25 times a second ("Shedding notify" in logcat).
    @Test
    fun aLiveStreamHasNoDurationToPublish() {
        val viewModel = player(live = true)
        var published = 0
        viewModel.onMetadataSync = { published++ }

        viewModel.onPositionChanged(1.00, 5.00, 4.0)
        viewModel.onPositionChanged(1.04, 5.04, 4.0)

        assertEquals(0.0, viewModel.duration, 0.0)
        assertEquals(0, published)
    }

    /** Counts the position ticks the renderer hands its delegate. */
    private class TickCounter : PlayerEngine.Delegate {
        var ticks = 0
        override fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double) { ticks++ }
        override fun onPauseChanged(isPaused: Boolean) {}
        override fun onLoadingChanged(isLoading: Boolean) {}
        override fun onReadyToSeek() {}
        override fun onTracksReady() {}
        override fun onError(message: String) {}
        override fun onVideoDimensionsChanged(width: Int, height: Int) {}
    }

    /**
     * The mpv renderer with no mpv behind it: properties are handed in as
     * mpv's event thread hands them, once the loaded file has started.
     */
    private fun renderer(live: Boolean, delegate: PlayerEngine.Delegate) =
        MPVLayerRenderer(RuntimeEnvironment.getApplication()).also {
            it.delegate = delegate
            it.load(VideoLoadConfig(url = "https://server/stream", isLive = live))
            // Without mpv, load() queues no playlist entry: start its file
            // (the first load's generation) as mpv's start event would.
            val generations = MPVLayerRenderer::class.java.getDeclaredField("loadGenerations")
                .apply { isAccessible = true }
                .get(it) as MpvLoadGenerations
            generations.queue(generation = 1, entryId = 1)
            generations.onStartFile(1)
            shadowOf(Looper.getMainLooper()).idle()
        }

    // The duration mpv gives a live stream moves many times a second, and
    // each value went to JS as a full position tick: 16 to 20 JS thread
    // wakeups a second on a channel on the Android TV emulator, 2 on a film.
    @Test
    fun aLiveStreamsGrowingDurationSendsNoTick() {
        val counter = TickCounter()
        val renderer = renderer(live = true, counter)

        renderer.eventProperty("duration", 5.00)
        renderer.eventProperty("duration", 5.04)
        shadowOf(Looper.getMainLooper()).idle()

        assertEquals(0, counter.ticks)
    }

    @Test
    fun aLiveStreamStillTicksWithItsPosition() {
        val counter = TickCounter()
        val renderer = renderer(live = true, counter)

        renderer.eventProperty("time-pos", 1.0)
        shadowOf(Looper.getMainLooper()).idle()

        assertEquals(1, counter.ticks)
    }

    @Test
    fun aFilmTicksWhenItsDurationIsKnown() {
        val counter = TickCounter()
        val renderer = renderer(live = false, counter)

        renderer.eventProperty("duration", 5400.0)
        shadowOf(Looper.getMainLooper()).idle()

        assertEquals(1, counter.ticks)
    }

    @Test
    fun aFilmPublishesItsDurationOnce() {
        val viewModel = player(live = false)
        var published = 0
        viewModel.onMetadataSync = { published++ }

        viewModel.onPositionChanged(1.00, 5400.0, 4.0)
        viewModel.onPositionChanged(1.04, 5400.0, 4.0)

        assertEquals(5400.0, viewModel.duration, 0.0)
        assertEquals(1, published)
    }

    // What the shared controller reads to keep seek, fast forward, rewind and
    // Previous off the session and the notification (SessionSkipTest).
    @Test
    fun theSessionOffersNoSeekOnALiveStream() {
        val session = MediaSessionController(RuntimeEnvironment.getApplication(), player(live = true)) {}

        assertFalse(session.target.canSeek)
    }

    @Test
    fun theSessionOffersSeekOnAFilm() {
        val session = MediaSessionController(RuntimeEnvironment.getApplication(), player(live = false)) {}

        assertTrue(session.target.canSeek)
    }

    @Test
    fun thePictureInPictureWindowOnlyPausesALiveStream() {
        val actions = PiPActions.buildActions(RuntimeEnvironment.getApplication(), isPlaying = true, canSeek = false)

        assertEquals(listOf("Pause"), actions.map { it.title.toString() })
    }

    @Test
    fun thePictureInPictureWindowSkipsThroughAFilm() {
        val actions = PiPActions.buildActions(RuntimeEnvironment.getApplication(), isPlaying = true, canSeek = true)

        assertEquals(listOf("Seek -15s", "Pause", "Seek +15s"), actions.map { it.title.toString() })
    }

    // The skip indicator showed over a stream that did not move.
    @Test
    fun aDoubleTapSkipsNothingOnALiveStream() {
        val viewModel = player(live = true)

        viewModel.doubleTapSeek(forward = true)

        assertNull(viewModel.doubleTapSeekForward)
        assertEquals(emptyList<String>(), seeks())
    }

    // With the chrome hidden, a skip key flashed the bar and its time. A
    // channel has neither: the key brings the chrome up, LIVE badge included.
    @Test
    fun aSkipKeyBringsUpTheChromeOfALiveStream() {
        val viewModel = player(live = true).apply { controlsVisible = false }
        val remote = TvRemoteKeyHandler(viewModel) {}

        remote.intercept(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT))

        assertTrue(viewModel.controlsVisible)
        assertFalse(viewModel.seekFeedbackVisible)
        assertEquals(emptyList<String>(), seeks())
    }

    @Test
    fun aFastForwardKeyBringsUpTheChromeOfALiveStream() {
        val viewModel = player(live = true).apply { controlsVisible = false }
        val remote = TvRemoteKeyHandler(viewModel) {}

        remote.intercept(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD))

        assertTrue(viewModel.controlsVisible)
        assertFalse(viewModel.seekFeedbackVisible)
        assertEquals(emptyList<String>(), seeks())
    }

    @Test
    fun aSkipKeySkipsThroughAFilm() {
        val viewModel = player(live = false).apply { controlsVisible = false }
        val remote = TvRemoteKeyHandler(viewModel) {}

        remote.intercept(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT))

        assertTrue(viewModel.seekFeedbackVisible)
        assertEquals(listOf("seekToTracked"), seeks())
    }

    // A live stream plays as it airs: faster drains what is buffered and the
    // channel falls back to its spinner every few seconds. The speed the
    // viewer saved for everything else stays theirs: JS is not told.
    @Test
    fun aLiveStreamPlaysAtNormalSpeed() {
        val viewModel = player(live = true)
        val events = mutableListOf<String>()
        viewModel.emit = { name, _ -> events += name }

        viewModel.setSpeed(1.5)

        assertEquals(1.0, viewModel.speed, 0.0)
        assertFalse(viewModel.canChangeSpeed)
        assertEquals(emptyList<String>(), events.filter { it == "onSpeedChange" })
    }

    @Test
    fun aFilmPlaysAtTheSpeedAsked() {
        val viewModel = player(live = false)

        viewModel.setSpeed(1.5)

        assertEquals(1.5, viewModel.speed, 0.0)
        assertTrue(viewModel.canChangeSpeed)
    }

    // The session sets the saved speed on every load, a channel's included.
    @Test
    fun aChannelLoadedOverAFasterFilmPlaysAtNormalSpeed() {
        val viewModel = player(live = false).apply { setSpeed(1.5) }

        viewModel.prepareForReload()
        viewModel.apply(config(live = true))
        viewModel.setSpeed(1.5)

        assertEquals(1.0, viewModel.speed, 0.0)
    }

    @Test
    fun aLiveStreamIsNotSpedUpByAHold() {
        val viewModel = player(live = true)

        viewModel.startHoldSpeed()

        assertFalse(viewModel.isHoldSpeedActive)
    }

    // mpv's start=0 is a seek to the stream's first timestamp, which a live
    // stream cannot do ("Cannot seek in this stream" on every channel).
    @Test
    fun aLiveStreamStartsWhereItIs() {
        val stream = StreamConfigRecord().apply {
            url = "https://server/stream"
            isLive = true
        }

        assertTrue(stream.toVideoLoadConfig()!!.isLive)
        assertEquals("none", mpvStartOption(startPosition = 0.0, isLive = true))
        assertEquals("none", mpvStartOption(startPosition = 12.0, isLive = true))
    }

    @Test
    fun aFilmStartsAtItsResumePoint() {
        assertEquals("0", mpvStartOption(startPosition = null, isLive = false))
        assertEquals("0", mpvStartOption(startPosition = 0.0, isLive = false))
        assertEquals("90.50", mpvStartOption(startPosition = 90.5, isLive = false))
    }
}
