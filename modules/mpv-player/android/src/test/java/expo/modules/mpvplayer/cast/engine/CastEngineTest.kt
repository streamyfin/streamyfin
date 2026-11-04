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

    // A second bind would add the bus listener again, and one stop removes only one of them.
    @Test
    fun aSecondStartBindsNothingMore() {
        val engine = engine()
        engine.start(PlayerEngine.Owner.NATIVE_SESSION) { started += 1 }
        engine.stop()
        port.deliver("""{"type":"playbackerror","message":"NotAllowed"}""")
        assertEquals(emptyList<String>(), delegate.errors)
        assertEquals(1, started)
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

    // Nothing plays once the receiver stops: a stall it stopped on ends the loading.
    @Test
    fun aStallTheReceiverStopsOnEndsTheLoading() {
        playing()
        media.report(snapshot(playerState = "buffering"))
        media.report(snapshot(playerState = "idle", idleReason = "error"))
        assertEquals(listOf(false, true, false), delegate.loadings)
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

    // A stream change for the same item: the status that interrupts the old stream still carries its
    // customData, while the time is the new stream's. The position holds until the new play session.
    @Test
    fun anInterruptedStatusHoldsThePosition() {
        val engine = playing(12_500, *reloadable)
        media.report(snapshot(playerState = "idle", idleReason = "interrupted", customData = ours(*reloadable)), 0)
        assertEquals(42.5, engine.currentPosition, 1e-9)
        media.tick(0)
        assertEquals(42.5, engine.currentPosition, 1e-9)
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

    // Play Services hands a seek's result over after the status that answered it.
    @Test
    fun aTrackedSeekAnsweredBeforeItsResultCompletesAtTheResult() {
        val engine = playing()
        engine.seekToTracked(125.6, false, 7)
        media.report(snapshot(), 125_600)
        media.finishSeek(true)
        assertEquals(listOf(7L to 125.6), delegate.seeksCompleted)
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

    // A track change the channel could not send: the getters keep the track the receiver plays, and
    // the host hears why.
    @Test
    fun aTrackChangeTheChannelCannotSendIsUndoneAndReported() {
        val engine = playing()
        port.sendError = "No Cast session to send on"
        engine.setSubtitleTrack(5)
        engine.setAudioTrack(2)
        assertEquals(3, engine.getCurrentSubtitleTrack())
        assertEquals(1, engine.getCurrentAudioTrack())
        assertEquals(List(2) { "No Cast session to send on" }, delegate.errors)
    }

    // The receiver could not reload for the new audio track, or never said so: the getters go back
    // to the track it plays.
    @Test
    fun anAudioChangeTheReceiverDoesNotLoadIsUndone() {
        val engine = playing()
        engine.setAudioTrack(2)
        port.deliver("""{"type":"connectionerror","message":"Request failed"}""")
        assertEquals(1, engine.getCurrentAudioTrack())
        engine.setAudioTrack(2)
        scheduler.advance(CastEngineConstants.LOAD_TIMEOUT_MS)
        assertEquals(1, engine.getCurrentAudioTrack())
    }

    @Test
    fun aReloadThatSettlesWithoutMediaEndsTheLoading() {
        val engine = playing()
        engine.setAudioTrack(2)
        media.report(snapshot(playerState = "idle", customData = null, hasMedia = false))
        scheduler.advance(CastEngineConstants.LOAD_TIMEOUT_MS)
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

    // The host acts on Loaded from the status that settled it, which is the engine's by then.
    @Test
    fun aLoadSettlesOnceItsStatusIsTheEngines() {
        val engine = engine()
        engine.load(SERVER, request) { if (it == CastLoadResult.Settled(ReceiverLoadOutcome.Loaded)) engine.seekTo(30.0) }
        media.report(snapshot())
        assertEquals(listOf(30_000L), media.seeks)
    }

    @Test
    fun aBusErrorOutsideALoadReportsItsWireName() {
        playing()
        port.deliver("""{"type":"playbackerror","message":"NotAllowed"}""")
        assertEquals(listOf("playback_failed"), delegate.errors)
    }

    // A failed PlaybackInfo comes as a connectionerror, then as the NoCompatibleStream playbackerror of
    // the same failure: one error, whether a load waits for it or not.
    @Test
    fun aPlaybackInfoFailureOutsideALoadReportsOneError() {
        playing()
        port.deliver("""{"type":"connectionerror","message":"Request failed"}""")
        port.deliver("""{"type":"playbackerror","message":"NoCompatibleStream"}""")
        assertEquals(listOf("playback_info_failed"), delegate.errors)
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

    // A quality change: the item again where it is, under the envelope's new cap.
    @Test
    fun reloadCurrentItemWithAServerSendsItsCap() {
        val engine = playing(42_500)
        engine.reloadCurrentItem(SERVER.copy(maxBitrate = 4_000_000))
        assertEquals(4_000_000L, JSONObject(port.sent.single().second).getLong("maxBitrate"))
    }

    // The receiver's PlayNow replaces its queue: a reload sends the queue the engine cast, from the
    // item the receiver plays.
    @Test
    fun aReloadKeepsTheQueueTheEngineCast() {
        val engine = engine()
        val album = ReceiverPlayRequest(items = listOf("t-1", "t-2", "t-3").map { ReceiverItem(id = it, type = "Audio") })
        engine.load(SERVER, album) {}
        media.report(snapshot(customData = ours("itemId" to "t-1")), 0)
        engine.enqueue(listOf("t-4"))
        media.report(snapshot(customData = ours("itemId" to "t-2", "playSessionId" to "ps-2")), 5_000)
        engine.reloadCurrentItem()
        val options = JSONObject(port.sent.last().second).getJSONObject("options")
        val items = options.getJSONArray("items")
        assertEquals(listOf("t-1", "t-2", "t-3", "t-4"), (0 until items.length()).map { items.getJSONObject(it).getString("Id") })
        assertEquals(1, options.getInt("startIndex"))
        assertEquals(50_000_000L, options.getLong("startPositionTicks"))
    }

    // A stop from the TV leaves an idle status that still carries the media, which play() on the
    // media channel cannot resume: Play casts the item again where it stopped. The SDK reports the
    // stream at 0 on that status (Task 14, run 12), so the engine keeps its own position there.
    @Test
    fun playAfterAStopFromTheTvCastsTheItemAgain() {
        val engine = playing(42_500)
        media.report(snapshot(playerState = "idle", idleReason = "cancelled"), 0)
        assertEquals(42.5, engine.currentPosition, 1e-9)
        engine.play()
        val sent = JSONObject(port.sent.single().second)
        assertEquals("PlayNow", sent.getString("command"))
        assertEquals("item-1", sent.getJSONObject("options").getJSONArray("items").getJSONObject(0).getString("Id"))
        assertEquals(425_000_000L, sent.getJSONObject("options").getLong("startPositionTicks"))
        assertEquals(emptyList<String>(), media.calls)
    }

    @Test
    fun playAfterTheItemEndedStartsItAgainFromTheStart() {
        val engine = playing(42_500)
        media.report(snapshot(playerState = "idle", idleReason = "finished"), 60_000)
        engine.togglePause()
        assertEquals(0L, JSONObject(port.sent.single().second).getJSONObject("options").getLong("startPositionTicks"))
        // Played again: the end it waited for is not one.
        scheduler.advance(CastEngineConstants.NEXT_ITEM_WAIT_MS)
        assertEquals(0, delegate.ended)
    }

    // A window the channel could not send is not on the receiver: a reload leaves it out.
    @Test
    fun aPlayLastTheChannelCannotSendStaysOutOfTheReplayQueue() {
        val engine = engine()
        engine.load(SERVER, ReceiverPlayRequest(items = listOf("t-1", "t-2").map { ReceiverItem(id = it, type = "Audio") })) {}
        media.report(snapshot(customData = ours("itemId" to "t-1")), 0)
        port.sendError = "No Cast session to send on"
        engine.enqueue(listOf("t-3"))
        port.sendError = null
        engine.reloadCurrentItem()
        val items = JSONObject(port.sent.last().second).getJSONObject("options").getJSONArray("items")
        assertEquals(listOf("t-1", "t-2"), (0 until items.length()).map { items.getJSONObject(it).getString("Id") })
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

    // An item the receiver cannot seek in has no start to go back to: Previous goes to the item before.
    @Test
    fun aPreviousOnAnItemThatCannotSeekGoesToTheItemBefore() {
        val engine = playing(42_500, "canSeek" to false)
        engine.skipToPrevious()
        assertEquals(listOf("PreviousTrack" to "{}"), commands())
    }

    @Test
    fun aQueueCommandTheChannelCannotSendIsReported() {
        val engine = playing(2_000)
        port.sendError = "No Cast session to send on"
        engine.skipToNext()
        engine.skipToPrevious()
        engine.enqueue(listOf("id-1"))
        assertEquals(List(3) { "No Cast session to send on" }, delegate.errors)
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

    @Test
    fun aResumeOntoAReceiverThatStoppedEndsTheLoading() {
        playing()
        source.listener!!.onSuspended("session-1")
        val media2 = FakeMedia()
        source.listener!!.onResumed(FakeSession(media = media2))
        media2.report(snapshot(playerState = "idle", customData = null, hasMedia = false))
        assertEquals(listOf(false, true, false), delegate.loadings)
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
    // to speak first to hear the receiver again (spec §8, risk 6). The receiver applies the envelope of
    // every message, whatever its command, so it speaks once a status shows an item it cast: on
    // another sender's item, the SetVolume switched the receiver's server and token to this one's.
    @Test
    fun aResumeAfterALoadReclaimsTheBusOnceTheReceiverShowsItsItem() {
        engine().loadRecorded()
        hub.suspend()
        val port2 = FakeChannelPort()
        hub.attach(port2)
        assertEquals(emptyList<Pair<String, String>>(), port2.sent)
        media.report(snapshot(), 0)
        media.report(snapshot(), 1_000)
        assertEquals(listOf("SetVolume" to "{}"), port2.sent.map { (_, text) -> JSONObject(text).let { it.getString("command") to it.getJSONObject("options").toString() } })
    }

    @Test
    fun aResumeOntoAnotherSendersItemReclaimsNothing() {
        engine().loadRecorded()
        hub.suspend()
        val port2 = FakeChannelPort()
        hub.attach(port2)
        media.report(snapshot(customData = ours("itemId" to "item-9", "playSessionId" to "ps-9")), 0)
        assertEquals(emptyList<Pair<String, String>>(), port2.sent)
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

    // Seen on a device (Task 14, run 4): a CastSession forgets its id once the SDK ends it, after a
    // suspend it could not resume. The end may come without an id or with the one the binding had.
    @Test
    fun aSessionThatForgetsItsIdWhenItEndsStillLosesTheBinding() {
        val engine = playing()
        val lost = mutableListOf<Pair<String?, String?>>()
        engine.bindingListener = CastBindingListener { sessionId, error -> lost += sessionId to error }
        source.listener!!.onSuspended("session-1")
        (source.current as FakeSession).sessionId = null
        source.listener!!.onEnded(null, "Network error (7)")
        assertEquals(listOf<Pair<String?, String?>>("session-1" to "Network error (7)"), lost)
        assertTrue(media.listener == null)
    }

    @Test
    fun anEndUnderTheBoundIdLosesTheBindingOnceTheSessionForgotIt() {
        val engine = playing()
        val lost = mutableListOf<Pair<String?, String?>>()
        engine.bindingListener = CastBindingListener { sessionId, error -> lost += sessionId to error }
        (source.current as FakeSession).sessionId = null
        source.listener!!.onEnded("session-1", "Network error (7)")
        assertEquals(listOf<Pair<String?, String?>>("session-1" to "Network error (7)"), lost)
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

    // A report without an id is the bound session's only once that session forgot its own: iOS reports
    // a session that failed to start without one.
    @Test
    fun aSuspendOrEndWithoutAnIdLeavesABindingWhoseSessionKeepsItsId() {
        val engine = playing()
        val lost = mutableListOf<Pair<String?, String?>>()
        engine.bindingListener = CastBindingListener { sessionId, error -> lost += sessionId to error }
        source.listener!!.onSuspended(null)
        source.listener!!.onEnded(null, "Failed to start")
        assertEquals(emptyList<Pair<String?, String?>>(), lost)
        assertEquals(listOf(false), delegate.loadings)
    }

    // The device proof reads these lines (e2e/suites/cast/README.md): transitions, never a message.
    @Test
    fun logsEachTransitionTheDeviceProofReads() {
        val engine = playing()
        engine.seekTo(10.0)
        engine.setAudioTrack(2)
        media.report(snapshot(customData = ours("playSessionId" to "ps-2", "audioStreamIndex" to 2)), 10_000)
        engine.load(SERVER, ReceiverPlayRequest(items = listOf(ReceiverItem(id = "item-2")))) {}
        media.report(snapshot(customData = ours("itemId" to "item-2", "playSessionId" to "ps-3", "canClientSeek" to false)))
        engine.seekTo(20.0)
        media.report(snapshot(playerState = "idle", idleReason = "finished", customData = null, hasMedia = false))
        source.listener!!.onEnded("session-1", null)
        assertEquals(
            listOf(
                "bound to session session-1 launched=null",
                "status playing playSession=ps-1 playMethod=Transcode canClientSeek=true",
                "seek 10.0 path=media",
                "send SetAudioStreamIndex",
                "reload settled loaded",
                "status playing playSession=ps-2 playMethod=Transcode canClientSeek=true",
                "send PlayNow",
                "status playing playSession=ps-3 playMethod=Transcode canClientSeek=false",
                "load settled loaded",
                "seek 20.0 path=bus",
                "send Seek",
                "idle finished, waiting for the next item",
                "binding lost session=session-1 error=null",
                "detached from session session-1",
            ),
            logs,
        )
    }

    @Test
    fun receiverIdentityFollowsWhoLaunchedTheReceiverApp() {
        for (launched in listOf(true, false, null)) {
            source.current = FakeSession(media = FakeMedia(), wasLaunched = launched)
            assertEquals(launched, engine().receiverIdentityIsOurs)
        }
    }

    // A skip, or any move of the receiver to another item, while a reload of the old one waits: the
    // reload only settles on a status of its own item, and the position stayed on its target with the
    // loading on for thirty seconds, then reported a timeout.
    @Test
    fun anotherItemOnTheReceiverEndsAReloadOfTheOldOne() {
        val engine = playing(12_500, *reloadable)
        engine.seekTo(125.6)
        engine.skipToNext()
        media.report(snapshot(customData = ours("itemId" to "track-2", "playSessionId" to "ps-4")), 3_000)
        assertEquals(3.0, engine.currentPosition, 1e-9)
        assertFalse(delegate.loadings.last())
        scheduler.advance(30_000)
        assertEquals(emptyList<String>(), delegate.errors)
    }

    // What acts on the item on screen waits for a load on its way: a quality change cast the old item
    // again over the queue the load had just sent, and a track change or a seek reached the old item.
    @Test
    fun theItemCommandsWaitForAPendingLoad() {
        val engine = playing(42_500)
        engine.load(SERVER, ReceiverPlayRequest(items = listOf(ReceiverItem(id = "item-2")))) {}
        engine.reloadCurrentItem()
        engine.setAudioTrack(2)
        engine.seekTo(10.0)
        assertEquals(listOf("PlayNow"), commands().map { it.first })
        assertEquals(emptyList<Long>(), media.seeks)
    }

    // After a finished item the receiver fetches the next one of the queue this engine cast: Play in
    // that gap cast the finished item again from its start, racing the receiver's own next.
    @Test
    fun playWhileTheNextItemOfTheQueueIsOnItsWayCastsNothing() {
        val engine = engine()
        val album = ReceiverPlayRequest(items = listOf("t-1", "t-2").map { ReceiverItem(id = it, type = "Audio") })
        engine.load(SERVER, album) {}
        media.report(snapshot(customData = ours("itemId" to "t-1")), 0)
        media.report(snapshot(customData = ours("itemId" to "t-1"), playerState = "idle", idleReason = "finished"), 0)
        port.sent.clear()
        engine.play()
        engine.togglePause()
        assertEquals(emptyList<Pair<String, String>>(), commands())
    }

    // A PlayNow the channel did not take leaves the receiver on its queue, under its server: a reload
    // after it cast the unsent queue's item alone, under the unsent envelope.
    @Test
    fun aLoadThatIsNotSentKeepsTheQueueAndTheServerTheReceiverHas() {
        val engine = engine()
        val album = ReceiverPlayRequest(items = listOf("t-1", "t-2", "t-3").map { ReceiverItem(id = it, type = "Audio") })
        engine.load(SERVER, album) {}
        media.report(snapshot(customData = ours("itemId" to "t-2", "playSessionId" to "ps-2")), 5_000)
        port.sendError = "receiver busy"
        engine.load(SERVER.copy(accessToken = "tok-other"), ReceiverPlayRequest(items = listOf("x-1", "x-2").map { ReceiverItem(id = it) })) {}
        port.sendError = null
        engine.reloadCurrentItem()
        val last = JSONObject(port.sent.last().second)
        val items = last.getJSONObject("options").getJSONArray("items")
        assertEquals(listOf("t-1", "t-2", "t-3"), (0 until items.length()).map { items.getJSONObject(it).getString("Id") })
        assertEquals(1, last.getJSONObject("options").getInt("startIndex"))
        assertEquals("tok-123", last.getString("accessToken"))
    }

    // The receiver does not say which copy of an item queued twice it plays: the engine follows the
    // copy it cast and where the queue went, where a reload used to go from the first copy.
    @Test
    fun aReloadOfAnItemQueuedTwiceGoesOnFromTheCopyThatPlays() {
        val engine = engine()
        val queue = listOf("A", "B", "A", "C").map { ReceiverItem(id = it, type = "Audio") }
        engine.load(SERVER, ReceiverPlayRequest(items = queue, startIndex = 2)) {}
        media.report(snapshot(customData = ours("itemId" to "A")), 0)
        engine.reloadCurrentItem()
        assertEquals(2, JSONObject(port.sent.last().second).getJSONObject("options").getInt("startIndex"))
    }

    @Test
    fun aQueueThatPlaysOnFollowsTheCopyOfAnItemQueuedTwice() {
        val engine = engine()
        val queue = listOf("A", "B", "A", "C").map { ReceiverItem(id = it, type = "Audio") }
        engine.load(SERVER, ReceiverPlayRequest(items = queue)) {}
        media.report(snapshot(customData = ours("itemId" to "A", "playSessionId" to "ps-1")), 0)
        media.report(snapshot(customData = ours("itemId" to "B", "playSessionId" to "ps-2")), 0)
        media.report(snapshot(customData = ours("itemId" to "A", "playSessionId" to "ps-3")), 0)
        engine.reloadCurrentItem()
        assertEquals(2, JSONObject(port.sent.last().second).getJSONObject("options").getInt("startIndex"))
    }

    // A resume joins the receiver app this sender launched, and the SDK then says it did not launch it:
    // the identity turned "not ours" after every resume.
    @Test
    fun aResumeKeepsWhoLaunchedTheReceiverApp() {
        source.current = FakeSession(media = media, wasLaunched = true)
        val engine = engine()
        source.listener!!.onSuspended("session-1")
        source.listener!!.onResumed(FakeSession(media = FakeMedia(), wasLaunched = false))
        assertEquals(true, engine.receiverIdentityIsOurs)
    }

    // Play Services hands a send's result over later: a PlayLast answered after a newer load added its
    // items to the new queue, which a reload then cast again.
    @Test
    fun aPlayLastAnsweredAfterANewLoadStaysOutOfIt() {
        val engine = engine()
        engine.load(SERVER, ReceiverPlayRequest(items = listOf(ReceiverItem(id = "t-1")))) {}
        port.holdResults = true
        engine.enqueue(listOf("t-4"))
        engine.load(SERVER, ReceiverPlayRequest(items = listOf(ReceiverItem(id = "b-1")))) {}
        port.holdResults = false
        port.releaseResults()
        media.report(snapshot(customData = ours("itemId" to "b-1", "playSessionId" to "ps-2")), 0)
        engine.reloadCurrentItem()
        val items = JSONObject(port.sent.last().second).getJSONObject("options").getJSONArray("items")
        assertEquals(listOf("b-1"), (0 until items.length()).map { items.getJSONObject(it).getString("Id") })
    }

    // A host that stops the engine and starts it again, a new chrome with a new delegate, never heard the
    // state the receiver was in: the dedupe kept what the old delegate had been told.
    @Test
    fun aStartAfterAStopReportsTheStateToTheNewDelegate() {
        val engine = playing()
        media.report(snapshot(playerState = "paused"))
        engine.stop()
        val next = RecordingDelegate()
        engine.delegate = next
        engine.start(PlayerEngine.Owner.NATIVE_SESSION) {}
        media.report(snapshot(playerState = "paused"))
        assertEquals(listOf(true), next.pauses)
        assertEquals(listOf(false), next.loadings)
    }

    // The hub, still on a session the SDK replaced, announces its ready inside the engine's subscribe:
    // the binding was lost there, yet the engine went on to listen to the media and to start.
    @Test
    fun aBindingLostWhileSubscribingNeitherListensNorStarts() {
        hub.attach(FakeChannelPort(sessionId = "session-2"))
        val lost = mutableListOf<Pair<String?, String?>>()
        CastEngine(SERVER, source, hub, scheduler.schedule, { it() }, logs::add).also {
            it.delegate = delegate
            it.bindingListener = CastBindingListener { sessionId, error -> lost += sessionId to error }
            it.start(PlayerEngine.Owner.NATIVE_SESSION) { started += 1 }
        }
        assertEquals(listOf<Pair<String?, String?>>("session-1" to "The Cast session was replaced"), lost)
        assertEquals(0, started)
        assertNull(media.listener)
    }

    // A reload over one the receiver has not answered: when the newer one failed, the track the older
    // one chose stayed in the getters, though the receiver never played it.
    @Test
    fun aReloadOverAnUnansweredOneUndoesBothWhenItFails() {
        val engine = playing(42_500, hasTextTracks = false)
        engine.setSubtitleTrack(5)
        engine.setAudioTrack(2)
        port.deliver("""{"type":"connectionerror","message":"Request failed"}""")
        assertEquals(3, engine.getCurrentSubtitleTrack())
        assertEquals(1, engine.getCurrentAudioTrack())
    }

    // A status of the item the TV played before can still come after a load went out: the engine's place
    // in the queue is the load's start until the load settles, or a copy queued twice is lost.
    @Test
    fun aStatusOfThePreviousItemKeepsTheLoadsPlaceInTheQueue() {
        val engine = playing()
        val queue = listOf("A", "B", "A", "C").map { ReceiverItem(id = it, type = "Audio") }
        engine.load(SERVER, ReceiverPlayRequest(items = queue, startIndex = 2)) {}
        media.report(snapshot(), 43_500)
        media.report(snapshot(customData = ours("itemId" to "A", "playSessionId" to "ps-2")), 0)
        engine.reloadCurrentItem()
        assertEquals(2, JSONObject(port.sent.last().second).getJSONObject("options").getInt("startIndex"))
    }

    // A SetVolume the channel did not take reclaimed nothing, and the engine stayed deaf to the bus
    // until its next command: the next status of the play session it left tries again.
    @Test
    fun aBusReclaimTheChannelRefusedIsTriedAgain() {
        engine().loadRecorded()
        media.report(snapshot(), 0)
        hub.suspend()
        val port2 = FakeChannelPort()
        hub.attach(port2)
        port2.sendError = "receiver busy"
        media.report(snapshot(), 1_000)
        port2.sendError = null
        media.report(snapshot(), 2_000)
        assertEquals(listOf("SetVolume", "SetVolume"), port2.sent.map { JSONObject(it.second).getString("command") })
    }

    // Another sender cast the same item while this engine was away, under its own play session: an item
    // of the queue proved nothing, and the SetVolume gave that playback this engine's server and token.
    @Test
    fun aResumeOntoItsItemUnderAnotherPlaySessionReclaimsNothing() {
        engine().loadRecorded()
        media.report(snapshot(), 0)
        hub.suspend()
        val port2 = FakeChannelPort()
        hub.attach(port2)
        media.report(snapshot(customData = ours("playSessionId" to "ps-9")), 0)
        assertEquals(emptyList<Pair<String, String>>(), port2.sent)
    }

    @Test
    fun aResumeOntoThePlaybackItLeftReclaimsTheBus() {
        engine().loadRecorded()
        media.report(snapshot(), 0)
        hub.suspend()
        val port2 = FakeChannelPort()
        hub.attach(port2)
        media.report(snapshot(), 1_000)
        assertEquals(listOf("SetVolume"), port2.sent.map { JSONObject(it.second).getString("command") })
    }

    // A tracked seek still unanswered when a load went out: its late answer completed the old request at
    // the new item's first status, and the chrome took that item's place for where the seek landed.
    @Test
    fun aTrackedSeekANewLoadSupersedesNeverCompletes() {
        val engine = playing()
        engine.seekToTracked(100.0, exact = true, requestId = 7)
        engine.load(SERVER, ReceiverPlayRequest(items = listOf(ReceiverItem(id = "b-1")))) {}
        media.finishSeek(true)
        media.report(snapshot(customData = ours("itemId" to "b-1", "playSessionId" to "ps-2")), 0)
        assertEquals(emptyList<Pair<Long, Double>>(), delegate.seeksCompleted)
    }

    @Test
    fun aTrackedSeekAnsweredBeforeANewLoadIsNotCompletedByIt() {
        val engine = playing()
        engine.seekToTracked(100.0, exact = true, requestId = 7)
        media.finishSeek(true)
        engine.load(SERVER, ReceiverPlayRequest(items = listOf(ReceiverItem(id = "b-1")))) {}
        media.report(snapshot(customData = ours("itemId" to "b-1", "playSessionId" to "ps-2")), 0)
        assertEquals(emptyList<Pair<Long, Double>>(), delegate.seeksCompleted)
    }

    // An item queued twice in a row: when the first copy ended the receiver went on to the second, the
    // engine stayed on the first, and a reload played the first copy again from the second's place.
    @Test
    fun theQueueGoingOnToTheNextCopyOfAnItemFollowsIt() {
        val engine = engine()
        val queue = listOf("A", "A", "B").map { ReceiverItem(id = it, type = "Audio") }
        engine.load(SERVER, ReceiverPlayRequest(items = queue)) {}
        media.report(snapshot(customData = ours("itemId" to "A", "playSessionId" to "ps-1")), 0)
        media.report(snapshot(customData = ours("itemId" to "A", "playSessionId" to "ps-1"), playerState = "idle", idleReason = "finished"), 0)
        media.report(snapshot(customData = ours("itemId" to "A", "playSessionId" to "ps-2")), 0)
        engine.reloadCurrentItem()
        assertEquals(1, JSONObject(port.sent.last().second).getJSONObject("options").optInt("startIndex", 0))
    }

    // The windows of a long enqueue went out at once and joined the queue as their results came back,
    // while the receiver queued them in the order sent; a window refused left a gap the next one filled.
    @Test
    fun aLongEnqueueSendsItsNextWindowOnceTheChannelTookTheLast() {
        val engine = engine()
        port.holdResults = true
        engine.enqueue((1..150).map { "t-$it" })
        assertEquals(1, playLasts())
        port.releaseResults()
        assertEquals(2, playLasts())
    }

    @Test
    fun aWindowTheChannelRefusedEndsTheEnqueue() {
        val engine = engine()
        port.sendError = "receiver busy"
        engine.enqueue((1..150).map { "t-$it" })
        assertEquals(1, playLasts())
        assertEquals(listOf("receiver busy"), delegate.errors)
    }

    // A load replaces the receiver's queue: the windows left would join the new one.
    @Test
    fun aLoadBetweenTwoWindowsKeepsTheRestOutOfTheNewQueue() {
        val engine = engine()
        port.holdResults = true
        engine.enqueue((1..150).map { "t-$it" })
        engine.load(SERVER, ReceiverPlayRequest(items = listOf(ReceiverItem(id = "b-1")))) {}
        port.releaseResults()
        assertEquals(1, playLasts())
    }

    private fun playLasts() = port.sent.count { JSONObject(it.second).getString("command") == "PlayLast" }
}
