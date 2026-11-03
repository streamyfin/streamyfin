package expo.modules.mpvplayer.cast.engine

import expo.modules.mpvplayer.cast.FakeChannelPort
import expo.modules.mpvplayer.cast.ReceiverChannelHub
import expo.modules.mpvplayer.cast.receiver.ReceiverItem
import expo.modules.mpvplayer.cast.receiver.ReceiverLoadOutcome
import expo.modules.mpvplayer.cast.receiver.ReceiverPlayRequest
import expo.modules.mpvplayer.cast.receiver.ReceiverProtocol
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.VideoLoadConfig
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The engine on fake ports: what the receiver reports reaches the chrome once and in plain values,
// and each command takes the channel the receiver honors for it (spec §3.3, §4.1, §6).
@RunWith(RobolectricTestRunner::class)
class CastEngineTest {
    private val ns = ReceiverProtocol.NAMESPACE
    private val hub = ReceiverChannelHub()
    private val port = FakeChannelPort()
    private val media = FakeMedia()
    private val session = FakeSession(media = media)
    private val source = FakeSource(session)
    private val scheduler = ManualScheduler()
    private val delegate = RecordingDelegate()
    private val logs = mutableListOf<String>()
    private var started = 0

    private fun engine(runOnMain: (() -> Unit) -> Unit = { it() }): CastEngine {
        hub.attach(port)
        return CastEngine(SERVER, source, hub, scheduler.schedule, runOnMain, logs::add).also {
            it.delegate = delegate
            it.start(PlayerEngine.Owner.NATIVE_SESSION) { started += 1 }
        }
    }

    /** A started engine whose receiver plays our item, under ps-1 unless [overrides] say otherwise. */
    private fun playing(positionMs: Long = 42_500, vararg overrides: Pair<String, Any?>, hasTextTracks: Boolean = true): CastEngine =
        engine().also { media.report(snapshot(customData = ours(*overrides), hasTextTracks = hasTextTracks), positionMs) }

    private fun commands() = port.sent.map { (_, text) ->
        JSONObject(text).let { it.getString("command") to it.getJSONObject("options").toString() }
    }

    // A transcoded track the receiver cannot seek in, loaded at 30 s: it reports 12.5 s from there.
    private val reloadable = arrayOf(
        "itemId" to "track-1",
        "playSessionId" to "ps-3",
        "canClientSeek" to false,
        "startPositionTicks" to 300_000_000L,
        "runtimeTicks" to 2_400_000_000L,
    )

    // Binding and state

    @Test
    fun startBindsTheConnectedSessionAndStarts() {
        engine()
        assertEquals(1, started)
        assertTrue(media.listener != null)
        assertEquals(1_000L, media.progressIntervalMs)
        assertEquals(1, media.statusRequests)
        assertTrue(hub.isReady(ns))
    }

    @Test
    fun startWithoutAConnectedSessionReportsTheErrorAndNeverStarts() {
        source.current = FakeSession(isConnected = false)
        engine()
        assertEquals(listOf("No connected Cast session"), delegate.errors)
        assertEquals(0, started)
    }

    @Test
    fun playingPausedAndBufferingReachTheDelegateOnce() {
        engine()
        listOf("playing", "playing", "paused", "buffering").forEach { media.report(snapshot(playerState = it)) }
        assertEquals(listOf(false, true), delegate.pauses)
        assertEquals(listOf(false, true), delegate.loadings)
    }

    @Test
    fun anIdleErrorReportsThePlaybackError() {
        playing()
        media.report(snapshot(playerState = "idle", idleReason = "error"))
        assertEquals(listOf("The receiver stopped on a playback error"), delegate.errors)
    }

    @Test
    fun canSeekMakesTheEngineReadyToSeekOncePerPlaySession() {
        engine()
        media.report(snapshot())
        media.report(snapshot())
        assertEquals(1, delegate.readyToSeek)
        media.report(snapshot(customData = ours("playSessionId" to "ps-2")))
        assertEquals(2, delegate.readyToSeek)
    }

    // Position and duration

    @Test
    fun noPositionBeforeAStatusWithMedia() {
        engine()
        media.tick(5_000)
        assertEquals(emptyList<Double>(), delegate.positions)
    }

    @Test
    fun durationIsTheRuntimeThenTheStreamThenZero() {
        val engine = playing()
        assertEquals(6000.0, engine.duration, 0.0)
        media.report(snapshot(customData = ours("runtimeTicks" to null), streamDurationMs = 120_000))
        assertEquals(120.0, engine.duration, 0.0)
        media.report(snapshot(customData = ours("runtimeTicks" to null), streamDurationMs = -1))
        assertEquals(0.0, engine.duration, 0.0)
    }

    // Transport

    @Test
    fun transportUsesTheMediaChannel() {
        val engine = playing()
        engine.play()
        engine.pause()
        engine.togglePause()
        assertEquals(listOf("play", "pause", "toggle"), media.calls)
        assertEquals(emptyList<Pair<String, String>>(), port.sent)
    }

    @Test
    fun transportWithoutAMediaSessionDoesNothing() {
        session.media = null
        val engine = engine()
        engine.play()
        engine.pause()
        engine.togglePause()
        assertEquals(emptyList<String>(), media.calls)
    }

    // Seeks

    @Test
    fun aSeekTheReceiverCanDoGoesThroughTheMediaChannel() {
        val engine = playing()
        engine.seekTo(125.6)
        assertEquals(listOf(125_600L), media.seeks)
        assertEquals(emptyList<Pair<String, String>>(), port.sent)
    }

    @Test
    fun aSeekIsIgnoredOnLiveOrIdle() {
        val engine = playing(42_500, "canSeek" to false)
        engine.seekTo(10.0)
        media.report(snapshot(playerState = "idle", idleReason = "canceled"))
        engine.seekTo(10.0)
        assertEquals(emptyList<Long>(), media.seeks)
        assertEquals(emptyList<Pair<String, String>>(), port.sent)
    }

    // Vigilance 3: a Seek the receiver reloads for must not jump to the old start plus the new time.
    @Test
    fun aSeekTheReceiverCannotDoHoldsTheTargetUntilTheNewPlaySession() {
        val engine = playing(12_500, *reloadable)
        assertEquals(42.5, engine.currentPosition, 1e-9)
        engine.seekTo(125.6)
        assertEquals("Seek" to """{"position":126}""", commands().last())
        assertEquals(125.6, engine.currentPosition, 1e-9)
        media.tick(13_000)
        assertEquals(125.6, engine.currentPosition, 1e-9)
        media.report(snapshot(customData = ours(*reloadable, "playSessionId" to "ps-4", "startPositionTicks" to 1_260_000_000L)), 500)
        assertEquals(126.5, engine.currentPosition, 1e-9)
        assertFalse(delegate.loadings.last())
    }

    @Test
    fun seekToTrackedCompletesWithItsRequestId() {
        val engine = playing()
        engine.seekToTracked(125.6, false, 7)
        media.finishSeek(true)
        assertEquals(emptyList<Pair<Long, Double>>(), delegate.seeksCompleted)
        media.report(snapshot(), 125_600)
        assertEquals(listOf(7L to 125.6), delegate.seeksCompleted)

        media.report(snapshot(customData = ours(*reloadable)), 12_500)
        engine.seekToTracked(126.5, false, 8)
        media.report(snapshot(customData = ours(*reloadable, "playSessionId" to "ps-4", "startPositionTicks" to 1_260_000_000L)), 500)
        assertEquals(listOf(7L to 125.6, 8L to 126.5), delegate.seeksCompleted)
    }

    @Test
    fun seekByAddsToThePositionInTheItem() {
        val engine = playing(42_500)
        engine.seekBy(30.0)
        assertEquals(listOf(72_500L), media.seeks)
    }

    @Test
    fun aReloadThatNeverSettlesGivesUpAfterThirtySeconds() {
        val engine = playing(12_500, *reloadable)
        engine.seekTo(125.6)
        scheduler.advance(29_999)
        assertEquals(emptyList<String>(), delegate.errors)
        scheduler.advance(1)
        assertEquals(listOf("timed_out"), delegate.errors)
        // Back to what the receiver reports: 12.5 s into a stream loaded at 30 s.
        assertEquals(42.5, engine.currentPosition, 1e-9)
    }

    // Tracks and calls that do nothing

    @Test
    fun aSubtitleChangeSendsTheJellyfinIndex() {
        val engine = playing()
        engine.setSubtitleTrack(3)
        engine.disableSubtitles()
        assertEquals(
            listOf("SetSubtitleStreamIndex" to """{"index":3}""", "SetSubtitleStreamIndex" to """{"index":-1}"""),
            commands(),
        )
    }

    // No text track loaded: the receiver would name the index in its reports and show nothing.
    @Test
    fun aSubtitleChangeWithoutTextTracksReloadsThroughPlayNow() {
        val engine = playing(42_500, hasTextTracks = false)
        engine.setSubtitleTrack(3)
        val expected = ReceiverProtocol.playNow(
            SERVER,
            ReceiverPlayRequest(
                items = listOf(ReceiverItem(id = "item-1")),
                startPositionTicks = 425_000_000,
                mediaSourceId = "ms-1",
                audioStreamIndex = 1,
                subtitleStreamIndex = 3,
            ),
        )
        assertEquals(listOf(expected.toString()), port.sent.map { it.second })
    }

    @Test
    fun anAudioChangeSendsSetAudioStreamIndexAndWaitsForTheReload() {
        val engine = playing()
        engine.setAudioTrack(2)
        assertEquals(listOf("SetAudioStreamIndex" to """{"index":2}"""), commands())
        assertTrue(delegate.loadings.last())
        media.report(snapshot())
        assertTrue(delegate.loadings.last())
        media.report(snapshot(customData = ours("playSessionId" to "ps-2", "audioStreamIndex" to 2)))
        assertFalse(delegate.loadings.last())
    }

    @Test
    fun trackCommandsWithoutOurMediaSendNothing() {
        val engine = engine()
        media.report(snapshot(customData = null))
        engine.setSubtitleTrack(3)
        engine.disableSubtitles()
        engine.setAudioTrack(2)
        assertEquals(emptyList<Pair<String, String>>(), port.sent)
    }

    @Test
    fun trackGettersReadTheBusThenTheCustomData() {
        val engine = playing()
        assertEquals(3, engine.getCurrentSubtitleTrack())
        assertEquals(1, engine.getCurrentAudioTrack())
        port.deliver("""{"type":"playbackprogress","data":{"PlayState":{"SubtitleStreamIndex":5,"AudioStreamIndex":2,"PlaySessionId":"ps-1"}}}""")
        assertEquals(5, engine.getCurrentSubtitleTrack())
        assertEquals(2, engine.getCurrentAudioTrack())
        media.report(snapshot(playerState = "idle", hasMedia = false, customData = null))
        assertEquals(-1, engine.getCurrentSubtitleTrack())
        assertEquals(-1, engine.getCurrentAudioTrack())
        assertEquals(emptyList<Map<String, Any>>(), engine.getSubtitleTracks())
        assertEquals(emptyList<Map<String, Any>>(), engine.getAudioTracks())
        assertEquals(emptyList<Map<String, Any>>(), engine.getChapters())
    }

    @Test
    fun speedStaysAtOneAndLocalOnlyCallsDoNothing() {
        val engine = playing()
        engine.setSpeed(2.0)
        engine.setAudioDelay(1.0)
        engine.setVolumeBoost(150)
        engine.setDialogueBoost(true)
        engine.setMonoDownmix(true)
        engine.addSubtitleFile("https://jellyfin.example.test/sub.vtt", true)
        assertEquals(1.0, engine.getSpeed(), 0.0)
        assertEquals(emptyList<Pair<String, String>>(), port.sent)
        assertEquals(emptyList<String>(), media.calls)
    }

    @Test
    fun aUrlLoadIsRefused() {
        val engine = playing()
        engine.load(VideoLoadConfig(url = "https://jellyfin.example.test/stream"))
        assertEquals(listOf("The Cast engine plays Jellyfin items, not URLs"), delegate.errors)
    }

    // Volume, identity, thread and detaching

    @Test
    fun muteAndTargetVolumeUseTheSession() {
        val engine = playing()
        engine.setMute(true)
        engine.setTargetVolume(0.3)
        assertEquals(true, session.muted)
        assertEquals(listOf(0.3), session.volumes)
        source.listener!!.onVolumeChanged(0.25, false)
        assertEquals(0.25, engine.targetVolume!!, 0.0)
    }

    @Test
    fun currentItemIdIsOurCustomDataItem() {
        val engine = playing()
        assertEquals("item-1", engine.currentItemId)
        media.report(snapshot(customData = null))
        assertNull(engine.currentItemId)
    }

    // Vigilance 5: NativePlayerModule calls the track setters from Expo's default queue, where the
    // SDK throws; the engine has to wait for the main thread.
    @Test
    fun aCallFromAnotherThreadWaitsForTheMainThread() {
        val main = MainQueue()
        val engine = engine(main.runOnMain)
        main.runAll()
        media.report(snapshot())
        engine.setSubtitleTrack(3)
        engine.play()
        assertEquals(emptyList<Pair<String, String>>(), port.sent)
        assertEquals(emptyList<String>(), media.calls)
        main.runAll()
        assertEquals(1, port.sent.size)
        assertEquals(listOf("play"), media.calls)
    }

    // Stopping the engine never stops the TV.
    @Test
    fun stopDetachesAndSendsNothing() {
        val engine = playing()
        engine.stop()
        assertNull(media.listener)
        assertEquals(listOf(ns), port.unregistrations)
        assertEquals(emptyList<Pair<String, String>>(), port.sent)
        assertFalse("stop" in media.calls)
    }

    @Test
    fun noSentMessageIsLogged() {
        val engine = playing(12_500, *reloadable)
        engine.seekTo(125.6)
        engine.setSubtitleTrack(3)
        engine.setAudioTrack(2)
        assertTrue(port.sent.isNotEmpty())
        assertTrue(logs.isNotEmpty())
        assertFalse(logs.any { "tok-123" in it })
    }

    // Loading

    private val request = ReceiverPlayRequest(items = listOf(ReceiverItem(id = "item-1", name = "A film", type = "Movie")))

    private fun CastEngine.loadRecorded(): MutableList<CastLoadResult> =
        mutableListOf<CastLoadResult>().also { results -> load(SERVER, request) { results += it } }

    @Test
    fun aLoadSendsOnePlayNowBuiltByTheProtocol() {
        engine().loadRecorded()
        assertEquals(listOf(ReceiverProtocol.playNow(SERVER, request).toString()), port.sent.map { it.second })
        assertEquals(listOf(true), delegate.loadings)
        assertFalse(logs.any { "tok-123" in it })
    }

    @Test
    fun aLoadWithoutSessionIsNotSent() {
        source.current = null
        val results = engine().loadRecorded()
        assertEquals(listOf(CastLoadResult.NotSent("No connected Cast session")), results)
        assertEquals(emptyList<Pair<String, String>>(), port.sent)
    }

    @Test
    fun aLoadTheChannelCannotSendIsNotSentAndLeavesNoTimer() {
        port.sendError = "receiver busy"
        val results = engine().loadRecorded()
        assertEquals(listOf(CastLoadResult.NotSent("receiver busy")), results)
        assertEquals(0, scheduler.pending)
    }

    @Test
    fun aPendingLoadIsLoadingUntilItSettles() {
        val results = engine().loadRecorded()
        assertEquals(listOf(true), delegate.loadings)
        media.report(snapshot())
        assertEquals(listOf(CastLoadResult.Settled(ReceiverLoadOutcome.Loaded)), results)
        assertEquals(listOf(true, false), delegate.loadings)
    }

    @Test
    fun aBusErrorOutsideALoadReportsItsWireName() {
        playing()
        port.deliver("""{"type":"playbackerror","message":"NotAllowed"}""")
        assertEquals(listOf("playback_failed"), delegate.errors)
    }

    // Reloads and the queue

    @Test
    fun reloadCurrentItemPlaysTheItemAgainWhereItIs() {
        val engine = playing(42_500)
        port.deliver("""{"type":"playbackprogress","data":{"PlayState":{"AudioStreamIndex":2,"SubtitleStreamIndex":5}}}""")
        engine.reloadCurrentItem()
        val expected = ReceiverProtocol.playNow(
            SERVER,
            ReceiverPlayRequest(
                items = listOf(ReceiverItem(id = "item-1")),
                startPositionTicks = 425_000_000,
                mediaSourceId = "ms-1",
                audioStreamIndex = 2,
                subtitleStreamIndex = 5,
            ),
        )
        assertEquals(listOf(expected.toString()), port.sent.map { it.second })
    }

    @Test
    fun queueCommandsReachTheReceiver() {
        val engine = playing(2_000)
        engine.skipToNext()
        engine.skipToPrevious()
        assertEquals(listOf("NextTrack" to "{}", "PreviousTrack" to "{}"), commands())
        engine.enqueue((0 until 250).map { "id-$it" })
        val appended = port.sent.drop(2).map { JSONObject(it.second) }
        assertEquals(listOf("PlayLast", "PlayLast", "PlayLast"), appended.map { it.getString("command") })
        assertEquals(listOf(100, 100, 50), appended.map { it.getJSONObject("options").getJSONArray("items").length() })
        assertEquals("""{"Id":"id-0","IsFolder":false}""", appended.first().getJSONObject("options").getJSONArray("items").getJSONObject(0).toString())
    }

    // The receiver never goes back to the start of the item it plays: past three seconds the engine
    // seeks there, as the chrome's own previous does.
    @Test
    fun aPreviousPastThreeSecondsRestartsTheItem() {
        val engine = playing(42_500)
        engine.skipToPrevious()
        assertEquals(listOf(0L), media.seeks)
        assertEquals(emptyList<Pair<String, String>>(), port.sent)
    }

    // The end of an item

    // Vigilance 4: after IDLE + FINISHED the receiver fetches the next item before it buffers.
    @Test
    fun aFinishedItemWithNoNextEndsAfterFifteenSeconds() {
        playing()
        media.report(snapshot(playerState = "idle", idleReason = "finished"))
        scheduler.advance(14_999)
        assertEquals(0, delegate.ended)
        scheduler.advance(1)
        assertEquals(1, delegate.ended)
    }

    @Test
    fun aNextItemWithinTheWaitCancelsTheEnd() {
        playing()
        media.report(snapshot(playerState = "idle", idleReason = "finished"))
        scheduler.advance(5_000)
        media.report(snapshot(playerState = "buffering", customData = ours("itemId" to "item-2", "playSessionId" to "ps-2")))
        scheduler.advance(15_000)
        assertEquals(0, delegate.ended)
    }

    // The session's life

    @Test
    fun aSuspendKeepsTheStateAndShowsLoading() {
        val engine = playing()
        val results = engine.loadRecorded()
        source.listener!!.onSuspended("session-1")
        assertTrue(delegate.loadings.last())
        assertEquals("item-1", engine.currentItemId)
        assertEquals(emptyList<CastLoadResult>(), results)
    }

    @Test
    fun aResumeRebindsTheNewMediaClientAndRefreshes() {
        playing()
        source.listener!!.onSuspended("session-1")
        val media2 = FakeMedia()
        source.listener!!.onResumed(FakeSession(media = media2))
        assertNull(media.listener)
        assertTrue(media2.listener != null)
        assertEquals(1, media2.statusRequests)
    }

    // Vigilance 1: a status the replaced media client had queued arrives after the new binding.
    @Test
    fun aStatusFromTheMediaClientBeforeTheResumeIsIgnored() {
        val engine = playing()
        val pausesBefore = delegate.pauses.toList()
        val stale = media.listener!!
        source.listener!!.onResumed(FakeSession(media = FakeMedia()))
        media.status = snapshot(customData = ours("playSessionId" to "ps-9"), playerState = "paused")
        stale.onStatusUpdated()
        assertEquals(pausesBefore, delegate.pauses)
        assertEquals("item-1", engine.currentItemId)
    }

    // The receiver sends its bus to the last sender that spoke: after a resume, a load's engine has
    // to speak first to hear the receiver again (spec §8, risk 6).
    @Test
    fun aResumeAfterALoadReclaimsTheBusWithAnInertCommand() {
        engine().loadRecorded()
        hub.suspend()
        val port2 = FakeChannelPort()
        hub.attach(port2)
        assertEquals(listOf("SetVolume" to "{}"), port2.sent.map { (_, text) -> JSONObject(text).let { it.getString("command") to it.getJSONObject("options").toString() } })
    }

    @Test
    fun aResumeWithoutALoadSendsNothing() {
        playing()
        hub.suspend()
        val port2 = FakeChannelPort()
        hub.attach(port2)
        assertEquals(emptyList<Pair<String, String>>(), port2.sent)
    }

    @Test
    fun aResumeOnAnotherSessionLosesTheBinding() {
        val engine = playing()
        val lost = mutableListOf<Pair<String?, String?>>()
        engine.bindingListener = CastBindingListener { sessionId, error -> lost += sessionId to error }
        source.listener!!.onResumed(FakeSession(sessionId = "session-2"))
        assertEquals(listOf<Pair<String?, String?>>("session-1" to "The Cast session was replaced"), lost)
    }

    @Test
    fun theSessionEndingSupersedesThePendingLoadAndLosesTheBinding() {
        val engine = playing()
        val lost = mutableListOf<Pair<String?, String?>>()
        engine.bindingListener = CastBindingListener { sessionId, error -> lost += sessionId to error }
        val results = engine.loadRecorded()
        source.listener!!.onEnded("session-1", null)
        assertEquals(listOf(CastLoadResult.Settled(ReceiverLoadOutcome.Superseded)), results)
        assertEquals(listOf<Pair<String?, String?>>("session-1" to null), lost)
    }

    // The SDK reports every session: another one's suspend or end leaves this binding alone.
    @Test
    fun anotherSessionsSuspendOrEndLeavesTheBinding() {
        val engine = playing()
        val lost = mutableListOf<Pair<String?, String?>>()
        engine.bindingListener = CastBindingListener { sessionId, error -> lost += sessionId to error }
        source.listener!!.onSuspended("session-9")
        source.listener!!.onEnded("session-9", "Network error (7)")
        assertEquals(emptyList<Pair<String?, String?>>(), lost)
        assertEquals(listOf(false), delegate.loadings)
        assertTrue(media.listener != null)
    }

    @Test
    fun receiverIdentityFollowsWhoLaunchedTheReceiverApp() {
        for (launched in listOf(true, false, null)) {
            source.current = FakeSession(media = FakeMedia(), wasLaunched = launched)
            assertEquals(launched, engine().receiverIdentityIsOurs)
        }
    }
}
