package expo.modules.mpvplayer.nativeplayer.remote

import android.content.pm.ActivityInfo
import android.os.Looper.getMainLooper
import android.view.KeyEvent
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewRootForTest
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import expo.modules.mpvplayer.cast.engine.ManualScheduler
import expo.modules.mpvplayer.cast.output.OutputPickerPresenter
import expo.modules.mpvplayer.cast.playback.RemotePlayback
import expo.modules.mpvplayer.cast.receiver.ReceiverItem
import expo.modules.mpvplayer.cast.receiver.ReceiverPlayRequest
import expo.modules.mpvplayer.cast.receiver.ReceiverServer
import expo.modules.mpvplayer.cast.target.FakeCastDevices
import expo.modules.mpvplayer.cast.target.RemoteTargetConstants
import expo.modules.mpvplayer.cast.target.RemoteTargetHub
import expo.modules.mpvplayer.cast.target.TargetPhase
import expo.modules.mpvplayer.nativeplayer.MetadataRecord
import expo.modules.mpvplayer.nativeplayer.NativePlayerSession
import expo.modules.mpvplayer.nativeplayer.NextEpisodeRecord
import expo.modules.mpvplayer.nativeplayer.NoRemoteEngineException
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.RemotePlayerConfigRecord
import expo.modules.mpvplayer.nativeplayer.RemotePlayerFailureRecord
import expo.modules.mpvplayer.nativeplayer.RemoteTintRecord
import expo.modules.mpvplayer.nativeplayer.TrackMenuItemRecord
import expo.modules.mpvplayer.nativeplayer.TrackMenusRecord
import expo.modules.mpvplayer.nativeplayer.jsTransportTarget
import expo.modules.mpvplayer.nativeplayer.engine.RemoteEngine
import java.time.Duration
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

// The remote screen is the chrome over a remote engine and nothing else: no surface, no change to the window
// (the bars stay, the phone sleeps, it turns with the phone), and closing it hands the engine back to the holder
// without stopping the TV. Every event it sends says it is remote, and the state of the TV decides when it closes.
@RunWith(RobolectricTestRunner::class)
class RemotePlayerSessionTest {
    /** The fake TV, its stops counted: closing a screen must never stop what the TV plays. */
    private class StopCountingEngine(private val inner: FakeRemoteEngine) : RemoteEngine by inner {
        var stops = 0
        override fun stop() {
            stops += 1
            inner.stop()
        }
    }

    private val clock = ManualScheduler()
    private val fake = FakeRemoteEngine(clock.schedule, { it() }, listOf(FakeRemoteItem("film", 60.0)))
    private val engine = StopCountingEngine(fake)

    // A session with the TV, its engine loaded and the film paused: a playing TV keeps the view model's frame
    // callback posting, and the main looper would never idle.
    private val playback = RemotePlayback(engineFactory = { engine }).also {
        it.setServer(ReceiverServer("https://jellyfin.example.test", "tok-123", "user-1", "Bench TV"))
        it.targetChanged(connected = true, suspended = false)
        clock.advance(PlayerConstants.FAKE_REMOTE_LOAD_MS)
        engine.pause()
    }
    private var tornDown = 0
    private val events = mutableListOf<Pair<String, Map<String, Any?>>>()
    private val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
    private val activity: ComponentActivity get() = screen.get()
    private var session: RemotePlayerSession? = null

    // Every test closes what it opened: a screen left up would outlive its test on the main looper.
    @After
    fun closeLeftovers() {
        session?.teardownImmediately()
        OutputPickerPresenter.dismiss()
        screen.pause().stop().destroy()
        shadowOf(getMainLooper()).idle()
    }

    // `idle = false` leaves the main looper alone: Robolectric cannot compose the output sheet's material sheet.
    private fun presented(
        on: ComponentActivity = activity,
        idle: Boolean = true,
        hub: RemoteTargetHub = RemoteTargetHub(),
        holder: RemotePlayback = playback,
        configure: (RemotePlayerConfigRecord) -> Unit = {},
    ): RemotePlayerSession {
        val session = RemotePlayerSession(
            hub = hub,
            playback = holder,
            emit = { name, body -> events += name to body },
            onTornDown = { tornDown += 1 },
            screenContent = { _, _ -> },
        )
        session.present(on, RemotePlayerConfigRecord().also {
            it.metadata = MetadataRecord().also { metadata -> metadata.title = "Bench episode" }
            it.targetName = "Bench TV"
            configure(it)
        })
        if (idle) shadowOf(getMainLooper()).idle()
        this.session = session
        return session
    }

    private fun content(): ViewGroup = activity.findViewById(android.R.id.content)

    private fun everyView(root: View): List<View> =
        if (root is ViewGroup) listOf(root) + (0 until root.childCount).flatMap { everyView(root.getChildAt(it)) } else listOf(root)

    private fun hasScreen(): Boolean = everyView(content()).any { it is ComposeView }

    // The TV button says the session's state (connected, connecting) to TalkBack, as the local chrome's does.
    @Test
    fun theTvButtonFollowsTheCastSession() {
        val scheduler = ManualScheduler()
        val hub = RemoteTargetHub().also { it.install(FakeCastDevices(scheduler.schedule)) }
        hub.startDiscovery(RemoteTargetHub.APP_DISCOVERY)
        hub.connect(FakeCastDevices.DEVICES[0].id)
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS)

        val session = presented(hub = hub)
        assertEquals(TargetPhase.CONNECTED, session.viewModel.castPhase)

        hub.disconnect(stopPlayback = false)
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS)
        assertEquals(TargetPhase.NONE, session.viewModel.castPhase)
    }

    @Test
    fun aRemoteSessionShowsNoSurface() {
        presented()

        assertTrue(hasScreen())
        assertFalse(everyView(activity.window.decorView).any { it is SurfaceView })
    }

    @Test
    fun aRemoteSessionLeavesTheWindowAlone() {
        val orientation = activity.requestedOrientation
        @Suppress("DEPRECATION")
        val uiVisibility = activity.window.decorView.systemUiVisibility

        presented()

        assertEquals(0, activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        assertEquals(orientation, activity.requestedOrientation)
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED, activity.requestedOrientation)
        @Suppress("DEPRECATION")
        assertEquals(uiVisibility, activity.window.decorView.systemUiVisibility)
        assertEquals(0, activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_FULLSCREEN)
    }

    // The holder is the engine's delegate for as long as the session lasts: a screen that took it would leave the
    // holder deaf once closed, and JS would stop hearing what the TV plays.
    @Test
    fun closingARemoteSessionHandsTheEngineBackAndNeverStopsIt() {
        val session = presented()
        assertSame(playback, engine.delegate)

        session.dismiss("closeButton")
        shadowOf(getMainLooper()).idle()

        assertEquals(0, engine.stops)
        assertSame(engine, playback.engine)
        assertSame(playback, engine.delegate)
        assertFalse(hasScreen())
        assertEquals(1, tornDown)
        assertEquals("closeButton", events.single { it.first == "onDismiss" }.second["reason"])
    }

    /** React Native's activity as the app has it, predictive back off: a back key reaches JS first. */
    class JsFirstActivity : ComponentActivity() {
        var jsBacks = 0

        @Deprecated("The path a back key takes in the app")
        override fun onBackPressed() {
            jsBacks += 1
        }
    }

    // The app turns predictive back off, so a back key goes to React Native's onBackPressed, and JS, before any
    // dispatcher callback, and JS pops its own page under the remote screen when it has one. The screen takes it first.
    @Test
    fun theBackKeyClosesTheRemoteSessionBeforeJsSeesIt() {
        val js = Robolectric.buildActivity(JsFirstActivity::class.java).setup()
        val roots = js.get().findViewById<ViewGroup>(android.R.id.content).childCount
        presented(js.get())

        js.get().dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK))
        js.get().dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK))
        shadowOf(getMainLooper()).idle()

        assertEquals(0, js.get().jsBacks)
        assertEquals("closeButton", events.single { it.first == "onDismiss" }.second["reason"])
        assertEquals(roots, js.get().findViewById<ViewGroup>(android.R.id.content).childCount)
        js.pause().stop().destroy()
    }

    @Test
    fun backClosesTheRemoteSession() {
        presented()

        activity.onBackPressedDispatcher.onBackPressed()
        shadowOf(getMainLooper()).idle()

        assertFalse(hasScreen())
        assertEquals("closeButton", events.single { it.first == "onDismiss" }.second["reason"])
    }

    @Test
    fun aReloadOfTheAppDetachesWithoutStopping() {
        val session = presented()

        session.teardownImmediately()
        shadowOf(getMainLooper()).idle()

        assertEquals(0, engine.stops)
        assertSame(playback, engine.delegate)
        assertFalse(hasScreen())
        assertEquals(1, tornDown)
    }

    // The system recreates the activity on a font or display size change: the screen added over the old one
    // would be shown nowhere, so it closes with it (learned fact native-view-dies-with-a-recreated-activity).
    @Test
    fun aRecreatedActivityClosesTheRemoteSession() {
        presented()

        screen.recreate()
        shadowOf(getMainLooper()).idle()

        assertEquals(0, engine.stops)
        assertEquals(1, tornDown)
    }

    @Test
    fun everyEventOfARemoteSessionIsMarked() {
        val session = presented()
        engine.delegate?.onPauseChanged(false)
        engine.delegate?.onPositionChanged(3.0, 120.0, 0.0)

        session.dismiss("closeButton")
        shadowOf(getMainLooper()).idle()

        assertTrue(events.map { it.first }.containsAll(listOf("onPlaybackStateChange", "onProgress", "onDismiss")))
        assertTrue("unmarked: $events", events.all { it.second["remote"] == true })
    }

    @Test
    fun jsTransportOnlyReachesALocalPlayer() {
        val remote = presented()
        val local = NativePlayerSession(emit = { _, _ -> }, onTornDown = {}, presenterProvider = { null })

        assertNull(jsTransportTarget(remote))
        assertSame(local.viewModel, jsTransportTarget(local))
        assertNull(jsTransportTarget(null))
    }

    // The remote screen opens from the app's Cast sheet: the sheet goes first, as for the local player, or it
    // would stay under the screen with its discovery running.
    @Test
    fun aRemoteSessionOpeningOverTheAppsSheetClosesIt() {
        OutputPickerPresenter.present(activity, anchor = null, playingHere = null) {}
        assertTrue(OutputPickerPresenter.isPresented)

        presented(idle = false)

        assertFalse(OutputPickerPresenter.isPresented)
    }

    @Test
    fun aTintFromJsReachesTheScreen() {
        val session = presented()
        assertEquals(RemoteColors.of(null, null, null), session.screenState?.colors)

        session.updateTint(RemoteTintRecord().also { it.top = "#1F3340"; it.bottom = "#0E1A21"; it.accent = "#C9A7FB" })
        shadowOf(getMainLooper()).idle()

        assertEquals(RemoteColors(top = 0xFF1F3340, bottom = 0xFF0E1A21, accent = 0xFFC9A7FB), session.screenState?.colors)
    }

    // The screen opens on what the TV plays: apply() starts the view model at the config's position, so the holder's
    // state has to come after it.
    @Test
    fun aScreenOpenedOnAPlayingTvStartsWhereTheTvIs() {
        engine.seekTo(30.0)
        engine.play()

        val session = presented(idle = false)

        assertEquals(30.0, session.viewModel.authoritativePosition, 0.0)
        assertEquals(60.0, session.viewModel.duration, 0.0)
        assertTrue(session.viewModel.isPlaying)
    }

    @Test
    fun aSessionWithNoEngineIsRefused() {
        val none = RemotePlayback()
        val session = RemotePlayerSession(
            playback = none,
            hub = RemoteTargetHub(),
            emit = { name, body -> events += name to body },
            onTornDown = { tornDown += 1 },
            screenContent = { _, _ -> },
        )

        assertThrows(NoRemoteEngineException::class.java) { session.present(activity, RemotePlayerConfigRecord()) }
        assertFalse(hasScreen())
        assertTrue(events.isEmpty())
    }

    @Test
    fun aFinishedConnectionDismissesWithRemoteEnded() {
        presented()

        playback.targetChanged(connected = false, suspended = false)
        shadowOf(getMainLooper()).idle()

        val dismiss = events.single { it.first == "onDismiss" }.second
        assertEquals("remoteEnded", dismiss["reason"])
        assertEquals(true, dismiss["remote"])
        assertFalse("a lost connection is no end of playback: $events", events.any { it.first == "onPlaybackEnded" })
        assertFalse(hasScreen())
        assertEquals(1, tornDown)
    }

    // The film is over on the TV and nothing follows: the end is reported, then the screen closes.
    @Test
    fun aFilmThatEndsDismissesWithPlaybackEnded() {
        presented()

        engine.skipToNext()
        shadowOf(getMainLooper()).idle()

        val names = events.map { it.first }
        assertTrue("ended then dismissed: $names", names.indexOf("onPlaybackEnded") in 0 until names.indexOf("onDismiss"))
        assertEquals("playbackEnded", events.single { it.first == "onDismiss" }.second["reason"])
        assertFalse(hasScreen())
    }

    // The SDK keeps a TV's finished status: Play on the next item opens the screen before its load leaves, and the
    // end of the item before must not close it.
    @Test
    fun aScreenOpenedOnAFinishedTvStaysForTheNextLoad() {
        engine.skipToNext()
        shadowOf(getMainLooper()).idle()

        presented()

        assertTrue(hasScreen())
        assertFalse("$events", events.any { it.first == "onDismiss" || it.first == "onPlaybackEnded" })
    }

    // The next episode is known: the screen stays for the card that offers it, no countdown and no question.
    @Test
    fun anEndWithANextEpisodeKeepsTheScreen() {
        val session = presented(configure = { it.nextEpisode = NextEpisodeRecord().apply { itemId = "next"; title = "Next" } })

        engine.skipToNext()
        shadowOf(getMainLooper()).idle()

        assertTrue(hasScreen())
        assertFalse(events.any { it.first == "onDismiss" })
        assertTrue(session.screenState!!.model.nextUpVisible)
        assertFalse(session.viewModel.showStillWatching)
        assertNull(session.viewModel.countdownRemaining)
    }

    // Continue on the card: JS sends what comes after the list the TV got. The screen stays for it.
    @Test
    fun continueAsksForTheNextUp() {
        val session = presented(configure = { it.nextEpisode = NextEpisodeRecord().apply { itemId = "next"; title = "Next" } })
        engine.skipToNext()
        shadowOf(getMainLooper()).idle()
        events.clear()

        session.screenState!!.continueNextUp()

        assertEquals(
            listOf(
                "onNextEpisodeRequested" to mapOf<String, Any?>(
                    "reason" to "nextUp",
                    "positionSec" to session.viewModel.authoritativePosition,
                    "remote" to true,
                ),
            ),
            events,
        )
        assertTrue(hasScreen())
    }

    // The card waits for the user however long the TV sits at its end: no countdown, no question, nothing sent.
    // The TV is finished, so the main looper can run on.
    @Test
    fun theNextUpCardNeverCountsDown() {
        val session = presented(configure = {
            it.nextEpisode = NextEpisodeRecord().apply {
                itemId = "next"
                title = "Next"
                countdownSeconds = 10.0
                stillWatchingRequired = true
            }
        })
        engine.skipToNext()
        shadowOf(getMainLooper()).idleFor(Duration.ofSeconds(30))

        assertTrue(session.screenState!!.model.nextUpVisible)
        assertNull(session.viewModel.countdownRemaining)
        assertFalse(session.viewModel.showStillWatching)
        assertFalse("$events", events.any { it.first == "onNextEpisodeRequested" })
        assertTrue(hasScreen())
    }

    // JS follows the TV onto the item it already plays (the next of the list it got): no phase change comes before
    // that item's end, which still closes the screen.
    @Test
    fun anUpdateForTheItemTheTvPlaysStillEndsIt() {
        val session = presented()
        session.update(RemotePlayerConfigRecord().also {
            it.metadata = MetadataRecord().also { metadata -> metadata.itemId = "film"; metadata.title = "Film" }
            it.targetName = "Bench TV"
        })
        shadowOf(getMainLooper()).idle()

        engine.skipToNext()
        shadowOf(getMainLooper()).idle()

        assertEquals("playbackEnded", events.singleOrNull { it.first == "onDismiss" }?.second?.get("reason"))
        assertFalse(hasScreen())
    }

    // A new send while the TV still holds the item before: that item's end is not the new one's.
    @Test
    fun anUpdateForAnotherItemWaitsForItsPlayback() {
        val session = presented()
        session.update(RemotePlayerConfigRecord().also {
            it.metadata = MetadataRecord().also { metadata -> metadata.itemId = "next-film"; metadata.title = "Next film" }
            it.targetName = "Bench TV"
        })
        shadowOf(getMainLooper()).idle()

        engine.skipToNext()
        shadowOf(getMainLooper()).idle()

        assertTrue(hasScreen())
        assertFalse("$events", events.any { it.first == "onDismiss" })
    }

    @Test
    fun aTvStoppedFromItsRemoteKeepsTheScreen() {
        val session = presented()

        fake.simulateStoppedFromReceiver()
        shadowOf(getMainLooper()).idle()

        assertTrue(hasScreen())
        assertFalse(events.any { it.first == "onDismiss" })
        assertFalse(session.screenState!!.model.seekEnabled)
        assertTrue(session.screenState!!.model.transportEnabled)
    }

    // Each config JS sends says whether the TV plays media our server does not know (PR 6): a full one after a
    // reduced one brings the menus back, and the other way round.
    @Test
    fun aReducedConfigReducesTheScreenAndAFullOneRestoresIt() {
        val session = presented(configure = { it.reduced = true })
        assertFalse(session.screenState!!.model.showsTrackMenus)
        assertFalse(session.screenState!!.model.showsPreviousNext)

        assertTrue(session.update(RemotePlayerConfigRecord().also { it.targetName = "Bench TV" }))
        assertTrue(session.screenState!!.model.showsTrackMenus)

        assertTrue(session.update(RemotePlayerConfigRecord().also { it.reduced = true }))
        assertFalse(session.screenState!!.model.showsEpisodes)
    }

    @Test
    fun theScreenSaysWhenTheSessionIsComingBack() {
        val session = presented()
        assertEquals(TargetLabel.Name("Bench TV"), session.screenState!!.model.targetLabel)

        playback.targetChanged(connected = true, suspended = true)
        assertEquals(TargetLabel.Reconnecting, session.screenState!!.model.targetLabel)
        assertTrue(session.screenState!!.model.controlsDimmed)

        playback.targetChanged(connected = true, suspended = false)
        assertEquals(TargetLabel.Name("Bench TV"), session.screenState!!.model.targetLabel)
        assertTrue(hasScreen())
    }

    // A failure the engine reports is the screen's to say, whatever the TV's state.
    @Test
    fun anEngineErrorShowsOnTheScreen() {
        val session = presented()

        playback.onError("Could not play there")

        assertEquals("Could not play there", session.screenState!!.model.failure)
    }

    private fun failure(message: String, canPlayHere: Boolean = true) = RemotePlayerFailureRecord().also {
        it.message = message
        it.canPlayHere = canPlayHere
    }

    private val server = ReceiverServer("https://jellyfin.example.test", "tok-123", "user-1", "Bench TV")

    // A send JS says failed shows under the title with Play here, through a progress tick and a pause, until the TV
    // loads something else; null takes it away.
    @Test
    fun aFailureIsShownUntilTheNextLoad() {
        val session = presented()

        session.showFailure(failure("The TV could not play this"))
        engine.delegate?.onPositionChanged(4.0, 60.0, 0.0)
        assertEquals("The TV could not play this", session.screenState!!.model.failure)
        assertTrue(session.screenState!!.model.canPlayHere)

        playback.load(server, ReceiverPlayRequest(listOf(ReceiverItem("episode-2")))) {}
        assertNull(session.screenState!!.model.failure)
        assertFalse(session.screenState!!.model.canPlayHere)

        session.showFailure(failure("Again", canPlayHere = false))
        assertEquals("Again", session.screenState!!.model.failure)
        assertFalse(session.screenState!!.model.canPlayHere)
        session.showFailure(null)
        assertNull(session.screenState!!.model.failure)
    }

    // The TV playing again takes the failure away too, the engine's own error with it (it used to stay for good).
    @Test
    fun aFailureClearsWhenTheTvPlaysAgain() {
        val session = presented()
        playback.onError("Could not play there")
        assertEquals("Could not play there", session.screenState!!.model.failure)

        engine.play()

        assertNull(session.screenState!!.model.failure)
    }

    @Test
    fun playHereAsksJsWithThePosition() {
        engine.seekTo(42.0)
        val session = presented()
        session.showFailure(failure("The TV could not play this"))
        events.clear()

        session.screenState!!.playHere()

        assertEquals(listOf("onPlayHereRequested" to mapOf<String, Any?>("positionSec" to 42.0, "remote" to true)), events)
        assertTrue(hasScreen())
    }

    // A new send while the screen is up replaces its whole config in place: metadata, the TV's name, the tracks,
    // the tint, and drops the failure. Nothing closes, and the screen stays on where the TV is.
    @Test
    fun anUpdateReplacesTheWholeConfigWithoutClosing() {
        engine.seekTo(20.0)
        val session = presented(configure = {
            it.tracks = TrackMenusRecord().also { tracks -> tracks.audio = listOf(track("English", 1, selected = true)) }
            it.tint = RemoteTintRecord().also { tint -> tint.top = "#1F3340"; tint.bottom = "#0E1A21"; tint.accent = "#C9A7FB" }
        })
        session.showFailure(failure("The TV could not play this"))
        events.clear()

        val updated = session.update(RemotePlayerConfigRecord().also {
            it.metadata = MetadataRecord().also { metadata -> metadata.title = "Next episode" }
            it.targetName = "Kitchen TV"
        })
        shadowOf(getMainLooper()).idle()

        assertTrue(updated)
        assertTrue(hasScreen())
        assertEquals(0, tornDown)
        assertFalse(events.any { it.first == "onDismiss" })
        assertEquals("Next episode", session.viewModel.metadata?.title)
        assertEquals(TargetLabel.Name("Kitchen TV"), session.screenState!!.model.targetLabel)
        assertEquals(emptyList<TrackMenuItemRecord>(), session.viewModel.audioMenu)
        assertEquals(RemoteColors.of(null, null, null), session.screenState!!.colors)
        assertNull(session.screenState!!.model.failure)
        assertEquals(20.0, session.viewModel.authoritativePosition, 0.0)
    }

    @Test
    fun anUpdateWithNoScreenUpAnswersFalse() {
        val session = presented()
        session.dismiss("closeButton")
        shadowOf(getMainLooper()).idle()

        assertFalse(session.update(RemotePlayerConfigRecord()))
    }

    // A control the TV's state leaves inactive is said disabled to TalkBack, which then runs none of its actions.
    // Each button and the bar is its own node: dimming the row around them does not reach them.
    @Test
    fun aReconnectingTvSaysItsInactiveControlsDisabledToTalkBack() {
        playback.targetChanged(connected = true, suspended = true)
        val session = RemotePlayerSession(
            hub = RemoteTargetHub(),
            playback = playback,
            emit = { name, body -> events += name to body },
            onTornDown = { tornDown += 1 },
        )
        this.session = session
        session.present(activity, RemotePlayerConfigRecord().also {
            it.metadata = MetadataRecord().also { metadata -> metadata.title = "Bench episode" }
            it.targetName = "Bench TV"
            it.tracks = TrackMenusRecord().also { tracks ->
                tracks.audio = listOf(track("English", 1, selected = true))
                tracks.subtitles = listOf(track("English", 2, selected = false))
            }
        })
        assertFalse(session.screenState!!.model.transportEnabled)
        // The screen composes as present() attaches it, from the TV's state: no later frame is needed, which
        // Compose does not always ask for under Robolectric after other suites. The wait covers the tint's fade.
        shadowOf(getMainLooper()).idleFor(Duration.ofMillis(PlayerConstants.REMOTE_TINT_FADE_MS.toLong()))

        val inactive = listOf("Seek Backward", "Play", "Seek Forward", "Playback position", "Audio", "Subtitles")
        val nodes = semanticsNodes().filter { it.label() in inactive }
        assertEquals(inactive.sorted(), nodes.mapNotNull { it.label() }.sorted())
        val saidEnabled = nodes.filterNot { it.config.contains(SemanticsProperties.Disabled) }.mapNotNull { it.label() }
        assertEquals(emptyList<String>(), saidEnabled.sorted())
    }

    private fun track(label: String, index: Int, selected: Boolean) = TrackMenuItemRecord().also {
        it.label = label
        it.jellyfinIndex = index
        it.selected = selected
    }

    // The screen's nodes as TalkBack reads them, each button merged with its icon.
    private fun semanticsNodes(): List<SemanticsNode> {
        val root = everyView(content()).filterIsInstance<ViewRootForTest>().first()
        fun walk(node: SemanticsNode): List<SemanticsNode> = listOf(node) + node.children.flatMap(::walk)
        return walk(root.semanticsOwner.rootSemanticsNode)
    }

    private fun SemanticsNode.label(): String? = config.getOrNull(SemanticsProperties.ContentDescription)?.firstOrNull()
}
