package expo.modules.mpvplayer.nativeplayer

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Choreographer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import expo.modules.mpvplayer.MPVLayerRenderer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.max

class PlayerViewModel : MPVLayerRenderer.Delegate {

    companion object {
        private const val TAG = "PlayerViewModel"
    }

    var renderer: MPVLayerRenderer? = null
    var emit: ((String, Map<String, Any?>) -> Unit)? = null
    var onDismissRequested: ((String) -> Unit)? = null
    var onRotateRequested: (() -> Unit)? = null
    var onHDRModeDetected: ((Boolean, Double) -> Unit)? = null
    var onHapticRequested: (() -> Unit)? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mainHandler = Handler(Looper.getMainLooper())

    // MARK: - Playback State (Compose State for fast UI bindings)
    var isPlaying by mutableStateOf(false)
    var isBuffering by mutableStateOf(true)
    var isReadyToSeek by mutableStateOf(false)
    var duration by mutableDoubleStateOf(0.0)
    var displayPosition by mutableDoubleStateOf(0.0)
    var cacheSeconds by mutableDoubleStateOf(0.0)
    var speed by mutableDoubleStateOf(1.0)
        private set
    var isHoldSpeedActive by mutableStateOf(false)
    var isPipActive by mutableStateOf(false)
    var errorMessage by mutableStateOf<String?>(null)
    var isZoomedToFill by mutableStateOf(false)
    var subtitleScale by mutableDoubleStateOf(1.0)
        private set
    var subtitleDelay by mutableDoubleStateOf(0.0)
        private set
    var audioDelay by mutableDoubleStateOf(0.0)
        private set
    var volumeBoostPercent by mutableIntStateOf(100)
        private set
    var dialogueBoostEnabled by mutableStateOf(false)
    var monoAudioEnabled by mutableStateOf(false)

    // MARK: - UI State
    var controlsVisible by mutableStateOf(true)
    var controlsLocked by mutableStateOf(false)
    var unlockButtonRevealed by mutableStateOf(false)
    var volumeSliderRevealed by mutableStateOf(false)
    var brightnessSliderRevealed by mutableStateOf(false)
    var isScrubbing by mutableStateOf(false)
    var scrubPosition by mutableDoubleStateOf(0.0)
    var showTechnicalInfo by mutableStateOf(false)
    var showEpisodeList by mutableStateOf(false)
    var doubleTapSeekForward by mutableStateOf<Boolean?>(null)
    var showSubtitleSearch by mutableStateOf(false)

    // MARK: - Content State
    var metadata by mutableStateOf<MetadataRecord?>(null)
    var chapters by mutableStateOf<List<ChapterRecord>>(emptyList())
    var segments by mutableStateOf<List<MediaSegmentRecord>>(emptyList())
    var activeSegment by mutableStateOf<MediaSegmentRecord?>(null)
    var nextEpisode by mutableStateOf<NextEpisodeRecord?>(null)
    var countdownRemaining by mutableStateOf<Double?>(null)
    var showStillWatching by mutableStateOf(false)
    var subtitleMenu by mutableStateOf<List<TrackMenuItemRecord>>(emptyList())
    var audioMenu by mutableStateOf<List<TrackMenuItemRecord>>(emptyList())
    var qualityMenu by mutableStateOf<List<TrackMenuItemRecord>>(emptyList())

    var subtitleSearchStatus by mutableStateOf("idle")
    var subtitleSearchResults by mutableStateOf<List<SubtitleSearchResultRecord>>(emptyList())
    var subtitleSearchError by mutableStateOf<String?>(null)
    var subtitleSearchLanguage by mutableStateOf("eng")
    var downloadingResultId by mutableStateOf<String?>(null)
    var episodeList by mutableStateOf<List<EpisodeListItemRecord>>(emptyList())
    var trickplay by mutableStateOf<TrickplayProvider?>(null)
    var sleepTimerMinutes by mutableStateOf<Int?>(null)
    var sleepTimerEndDate by mutableStateOf<Long?>(null)

    var uiOptions by mutableStateOf(UIOptionsRecord())
    var strings by mutableStateOf(PlayerStrings(emptyMap()))

    // Controllers
    var volumeController: SystemVolumeController? = null
    var brightnessController: BrightnessController? = null

    // Internals
    private var authoritativePosition: Double = 0.0
    private var hasAuthoritativePosition = false
    private var pendingSeekReport = false
    private var speedBeforeHold: Double? = null
    private var currentItemId: String? = null
    private var isTearingDown = false
    private var wasPlayingBeforeScrub = false
    private var countdownCanceled = false
    private var countdownFired = false

    private var autoHideJob: Job? = null
    private var countdownJob: Job? = null
    private var volumeRevealJob: Job? = null
    private var brightnessRevealJob: Job? = null
    private var unlockRevealJob: Job? = null
    private var doubleTapFeedbackJob: Job? = null
    private var sleepTimerJob: Job? = null

    private var lastTickNanos: Long = 0L
    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            if (isTearingDown) return
            if (isPlaying && hasAuthoritativePosition && !isScrubbing && !isBuffering) {
                if (lastTickNanos != 0L) {
                    val deltaSec = (frameTimeNanos - lastTickNanos) / 1_000_000_000.0
                    val currentSpeed = if (isHoldSpeedActive) (uiOptions.holdToSpeedRate) else speed
                    val newPos = displayPosition + (deltaSec * currentSpeed)
                    if (duration > 0 && newPos <= duration) {
                        displayPosition = newPos
                        checkSegmentsAndCountdown(newPos)
                    }
                }
                lastTickNanos = frameTimeNanos
                Choreographer.getInstance().postFrameCallback(this)
            } else {
                lastTickNanos = 0L
            }
        }
    }

    fun apply(config: PlayerPresentConfigRecord) {
        val newItemId = config.metadata?.itemId
        if (newItemId == null || newItemId != currentItemId) {
            countdownCanceled = false
            countdownFired = false
            subtitleDelay = 0.0
            audioDelay = 0.0
            volumeBoostPercent = 100
            dialogueBoostEnabled = false
            monoAudioEnabled = false
            subtitleSearchStatus = "idle"
            subtitleSearchResults = emptyList()
            subtitleSearchError = null
            downloadingResultId = null
            subtitleSearchLanguage = config.ui.subtitleSearchDefaultLanguage
        }
        currentItemId = newItemId
        metadata = config.metadata
        chapters = config.chapters.sortedBy { it.startSec }
        segments = config.segments
        nextEpisode = config.nextEpisode
        episodeList = config.episodeList
        subtitleMenu = config.tracks?.subtitles ?: emptyList()
        audioMenu = config.tracks?.audio ?: emptyList()
        qualityMenu = config.tracks?.quality ?: emptyList()
        trickplay = config.trickplay?.let { TrickplayProvider(it) }
        uiOptions = config.ui
        strings = PlayerStrings(config.ui.strings)
        subtitleScale = config.subtitleStyle?.scale ?: 1.0

        val startPos = config.stream.startPositionSec ?: 0.0
        authoritativePosition = startPos
        displayPosition = startPos
        hasAuthoritativePosition = false
        showControls()
    }

    fun prepareForReload() {
        isHoldSpeedActive = false
        speedBeforeHold = nilSpeed()
        isBuffering = true
        isReadyToSeek = false
        isScrubbing = false
        scrubPosition = 0.0
        duration = 0.0
        cacheSeconds = 0.0
        activeSegment = null
        cancelCountdown()
        countdownRemaining = null
        showStillWatching = false
        showEpisodeList = false
        showSubtitleSearch = false
        downloadingResultId = null
        errorMessage = null
    }

    private fun nilSpeed(): Double? = null

    fun updateSegments(newSegments: List<MediaSegmentRecord>) {
        segments = newSegments
        checkSegmentsAndCountdown(displayPosition)
    }

    fun updateNextEpisode(next: NextEpisodeRecord?) {
        nextEpisode = next
        checkSegmentsAndCountdown(displayPosition)
    }

    fun updateChapters(newChapters: List<ChapterRecord>) {
        chapters = newChapters.sortedBy { it.startSec }
    }

    fun updateTrickplay(config: TrickplayRecord?) {
        trickplay = config?.let { TrickplayProvider(it) }
    }

    fun updateTrackMenus(menus: TrackMenusRecord) {
        subtitleMenu = menus.subtitles
        audioMenu = menus.audio
        qualityMenu = menus.quality
    }

    fun updateMetadata(newMetadata: MetadataRecord) {
        metadata = newMetadata
    }

    fun updateEpisodeList(episodes: List<EpisodeListItemRecord>) {
        episodeList = episodes
    }

    fun updateSubtitleSearch(state: SubtitleSearchStateRecord) {
        subtitleSearchStatus = state.status
        subtitleSearchResults = state.results
        subtitleSearchError = state.errorMessage
        if (state.status == "applied" || state.status == "idle" || state.status == "error") {
            downloadingResultId = null
        }
    }

    // MARK: - Auto Hide
    fun toggleControls() {
        if (controlsLocked) {
            if (unlockButtonRevealed) {
                unlockRevealJob?.cancel()
                unlockButtonRevealed = false
            } else {
                revealUnlockButton()
            }
            return
        }
        if (controlsVisible) {
            controlsVisible = false
            autoHideJob?.cancel()
        } else {
            showControls()
        }
    }

    fun showControls() {
        controlsVisible = true
        scheduleAutoHide()
    }

    fun scheduleAutoHide(delayMs: Long = PlayerConstants.AUTO_HIDE_DELAY_MS) {
        autoHideJob?.cancel()
        autoHideJob = scope.launch {
            delay(delayMs)
            if (canAutoHide()) {
                controlsVisible = false
            } else {
                scheduleAutoHide()
            }
        }
    }

    fun menuInteractionStarted() {
        scheduleAutoHide(PlayerConstants.MENU_AUTO_HIDE_DELAY_MS)
    }

    private fun canAutoHide(): Boolean {
        return isPlaying && !isScrubbing && !isBuffering && !showEpisodeList && !showTechnicalInfo && !showSubtitleSearch && errorMessage == null
    }

    private fun revealUnlockButton() {
        unlockButtonRevealed = true
        unlockRevealJob?.cancel()
        unlockRevealJob = scope.launch {
            delay(3000L)
            unlockButtonRevealed = false
        }
    }

    fun revealVolumeSliderTransiently() {
        volumeSliderRevealed = true
        volumeRevealJob?.cancel()
        volumeRevealJob = scope.launch {
            delay(2000L)
            volumeSliderRevealed = false
        }
    }

    fun revealBrightnessSliderTransiently() {
        brightnessSliderRevealed = true
        brightnessRevealJob?.cancel()
        brightnessRevealJob = scope.launch {
            delay(2000L)
            brightnessSliderRevealed = false
        }
    }

    // MARK: - Playback Transport
    fun play() {
        renderer?.play()
    }

    fun pause() {
        renderer?.pause()
    }

    fun togglePlayPause() {
        haptic()
        if (isPlaying) pause() else play()
        scheduleAutoHide()
    }

    fun seekTo(positionSec: Double) {
        val clamped = max(0.0, positionSec)
        pendingSeekReport = true
        displayPosition = clamped
        authoritativePosition = clamped
        renderer?.seekTo(clamped)
        scheduleAutoHide()
    }

    fun seekBy(seconds: Double) {
        val target = max(0.0, displayPosition + seconds)
        seekTo(target)
    }

    fun doubleTapSeek(forward: Boolean) {
        if (!uiOptions.doubleTapToSeekEnabled) return
        val delta = if (forward) uiOptions.seekForwardSec else -uiOptions.seekBackwardSec
        seekBy(delta)
        doubleTapSeekForward = forward
        doubleTapFeedbackJob?.cancel()
        doubleTapFeedbackJob = scope.launch {
            delay(700L)
            doubleTapSeekForward = null
        }
    }

    @JvmName("applySpeed")
    fun setSpeed(newSpeed: Double) {
        speed = newSpeed
        renderer?.setSpeed(newSpeed)
        emit?.invoke("onSpeedChange", mapOf("speed" to newSpeed))
        scheduleAutoHide()
    }

    fun startHoldSpeed() {
        if (!uiOptions.holdToSpeedEnabled || isHoldSpeedActive || isScrubbing) return
        haptic()
        speedBeforeHold = speed
        isHoldSpeedActive = true
        renderer?.setSpeed(uiOptions.holdToSpeedRate)
    }

    fun stopHoldSpeed() {
        if (!isHoldSpeedActive) return
        isHoldSpeedActive = false
        val original = speedBeforeHold ?: 1.0
        speedBeforeHold = null
        renderer?.setSpeed(original)
    }

    // MARK: - Scrubbing
    fun startScrubbing() {
        wasPlayingBeforeScrub = isPlaying
        if (isPlaying) renderer?.pause()
        isScrubbing = true
        scrubPosition = displayPosition
        scheduleAutoHide(PlayerConstants.MENU_AUTO_HIDE_DELAY_MS)
    }

    fun updateScrub(targetPosition: Double) {
        val clamped = max(0.0, targetPosition)
        scrubPosition = clamped
        displayPosition = clamped
        scheduleAutoHide(PlayerConstants.MENU_AUTO_HIDE_DELAY_MS)
    }

    fun finishScrubbing(targetPosition: Double) {
        val clamped = max(0.0, targetPosition)
        isScrubbing = false
        seekTo(clamped)
        if (wasPlayingBeforeScrub) {
            renderer?.play()
        }
        scheduleAutoHide()
    }

    // MARK: - Video Zoom & Track Controls
    fun toggleZoomToFill() {
        haptic()
        isZoomedToFill = !isZoomedToFill
        applyZoomState()
        scheduleAutoHide()
    }

    fun applyZoomState() {
        renderer?.setZoomedToFill(isZoomedToFill)
    }

    @JvmName("applySubtitleScale")
    fun setSubtitleScale(scale: Double) {
        subtitleScale = scale
        renderer?.setSubtitleScale(scale)
        emit?.invoke("onSubtitleScaleChange", mapOf("scale" to scale))
        scheduleAutoHide()
    }

    @JvmName("applySubtitleDelay")
    fun setSubtitleDelay(seconds: Double) {
        subtitleDelay = seconds
        renderer?.setSubtitleDelay(seconds)
        scheduleAutoHide()
    }

    @JvmName("applyAudioDelay")
    fun setAudioDelay(seconds: Double) {
        audioDelay = seconds
        renderer?.setAudioDelay(seconds)
        scheduleAutoHide()
    }

    @JvmName("applyVolumeBoost")
    fun setVolumeBoost(percent: Int) {
        volumeBoostPercent = percent
        renderer?.setVolumeBoost(percent)
        scheduleAutoHide()
    }

    fun toggleDialogueBoost() {
        dialogueBoostEnabled = !dialogueBoostEnabled
        renderer?.setDialogueBoost(dialogueBoostEnabled)
        scheduleAutoHide()
    }

    fun toggleMonoAudio() {
        monoAudioEnabled = !monoAudioEnabled
        renderer?.setMonoDownmix(monoAudioEnabled)
        scheduleAutoHide()
    }

    fun selectSubtitle(item: TrackMenuItemRecord) {
        haptic()
        emit?.invoke("onTrackSelectionRequested", mapOf(
            "kind" to "subtitle",
            "jellyfinIndex" to item.jellyfinIndex,
            "positionSec" to displayPosition
        ))
        if (!item.requiresReload) {
            subtitleMenu = subtitleMenu.map { it.copy(selected = (it.jellyfinIndex == item.jellyfinIndex)) }
        }
        scheduleAutoHide()
    }

    fun selectAudio(item: TrackMenuItemRecord) {
        haptic()
        emit?.invoke("onTrackSelectionRequested", mapOf(
            "kind" to "audio",
            "jellyfinIndex" to item.jellyfinIndex,
            "positionSec" to displayPosition
        ))
        if (!item.requiresReload) {
            audioMenu = audioMenu.map { it.copy(selected = (it.jellyfinIndex == item.jellyfinIndex)) }
        }
        scheduleAutoHide()
    }

    fun selectQuality(item: TrackMenuItemRecord) {
        haptic()
        emit?.invoke("onQualitySelected", mapOf(
            "bitrateValue" to item.jellyfinIndex,
            "positionSec" to displayPosition
        ))
        scheduleAutoHide()
    }

    // MARK: - Lock Controls & Rotation
    fun lockControls() {
        controlsLocked = true
        controlsVisible = false
        revealUnlockButton()
    }

    fun unlockControls() {
        controlsLocked = false
        unlockButtonRevealed = false
        showControls()
    }

    fun requestRotate() {
        val target = if (uiOptions.orientationLock == "landscape") "portrait" else "landscape"
        emit?.invoke("onOrientationChangeRequested", mapOf("orientation" to target))
        onRotateRequested?.invoke()
        scheduleAutoHide()
    }

    fun close() {
        onDismissRequested?.invoke("closeButton")
    }

    // MARK: - Sleep Timer
    fun setSleepTimer(minutes: Int) {
        sleepTimerMinutes = minutes
        val deadline = System.currentTimeMillis() + (minutes * 60 * 1000L)
        sleepTimerEndDate = deadline
        sleepTimerJob?.cancel()
        sleepTimerJob = scope.launch {
            delay(minutes * 60 * 1000L)
            onDismissRequested?.invoke("programmatic")
        }
        scheduleAutoHide()
    }

    fun cancelSleepTimer() {
        sleepTimerMinutes = null
        sleepTimerEndDate = null
        sleepTimerJob?.cancel()
        scheduleAutoHide()
    }

    // MARK: - Segments & Countdown
    private fun checkSegmentsAndCountdown(pos: Double) {
        // Segments
        val matched = segments.firstOrNull { pos >= it.startSec && pos < it.endSec }
        activeSegment = matched

        // Next episode countdown
        val next = nextEpisode ?: return
        if (countdownCanceled || countdownFired) return

        val remaining = duration - pos
        val countdownSecs = next.countdownSeconds
        val shouldArm = countdownSecs > 0 && remaining <= countdownSecs && remaining > 0

        if (shouldArm) {
            if (countdownRemaining == null) {
                startCountdown(remaining)
            }
        }
    }

    private fun startCountdown(initialSecs: Double) {
        countdownRemaining = initialSecs
        countdownJob?.cancel()
        countdownJob = scope.launch {
            var rem = initialSecs
            while (rem > 0 && isPlaying) {
                delay(500L)
                rem -= 0.5
                countdownRemaining = max(0.0, rem)
                if (rem <= 0.0) {
                    fireNextEpisode(reason = "countdown")
                    break
                }
            }
        }
    }

    fun skipActiveSegment() {
        val segment = activeSegment ?: return
        haptic()
        seekTo(segment.endSec)
    }

    fun playNextEpisodeNow() {
        haptic()
        cancelCountdown()
        fireNextEpisode(reason = "userTap")
    }

    fun cancelNextEpisodeCountdown() {
        haptic()
        countdownCanceled = true
        cancelCountdown()
        countdownRemaining = null
    }

    private fun cancelCountdown() {
        countdownJob?.cancel()
        countdownJob = null
    }

    private fun fireNextEpisode(reason: String) {
        countdownFired = true
        countdownRemaining = null
        emit?.invoke("onNextEpisodeRequested", mapOf(
            "reason" to reason,
            "positionSec" to displayPosition
        ))
    }

    fun continueWatchingFromStillWatching() {
        showStillWatching = false
        fireNextEpisode(reason = "userTap")
    }

    // MARK: - Episode List & Subtitle Search
    fun selectEpisode(itemId: String) {
        haptic()
        emit?.invoke("onEpisodeSelected", mapOf(
            "itemId" to itemId,
            "positionSec" to displayPosition
        ))
        showEpisodeList = false
    }

    fun openSubtitleSearch() {
        showSubtitleSearch = true
        emit?.invoke("onSubtitleSearchRequested", mapOf("language" to subtitleSearchLanguage))
        scheduleAutoHide(PlayerConstants.MENU_AUTO_HIDE_DELAY_MS)
    }

    fun searchSubtitles(language: String) {
        subtitleSearchLanguage = language
        subtitleSearchStatus = "searching"
        emit?.invoke("onSubtitleSearchRequested", mapOf("language" to language))
    }

    fun downloadSubtitle(resultId: String) {
        downloadingResultId = resultId
        subtitleSearchStatus = "downloading"
        emit?.invoke("onSubtitleDownloadRequested", mapOf(
            "resultId" to resultId,
            "positionSec" to displayPosition
        ))
    }

    fun haptic() {
        if (uiOptions.hapticsEnabled) {
            onHapticRequested?.invoke()
        }
    }

    fun willTeardown() {
        isTearingDown = true
        autoHideJob?.cancel()
        countdownJob?.cancel()
        volumeRevealJob?.cancel()
        brightnessRevealJob?.cancel()
        unlockRevealJob?.cancel()
        doubleTapFeedbackJob?.cancel()
        sleepTimerJob?.cancel()
        scope.cancel()
    }

    // MARK: - MPVLayerRenderer.Delegate Implementation

    override fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double) {
        authoritativePosition = position
        this.duration = duration
        this.cacheSeconds = cacheSeconds
        hasAuthoritativePosition = true

        if (!isScrubbing) {
            displayPosition = position
            checkSegmentsAndCountdown(position)
        }

        val didSeek = pendingSeekReport
        pendingSeekReport = false

        emit?.invoke("onProgress", mapOf(
            "position" to position,
            "duration" to duration,
            "progress" to if (duration > 0) (position / duration) else 0.0,
            "cacheSeconds" to cacheSeconds,
            "didSeek" to didSeek
        ))
    }

    override fun onPauseChanged(isPaused: Boolean) {
        val playing = !isPaused
        isPlaying = playing
        if (playing) {
            Choreographer.getInstance().postFrameCallback(frameCallback)
            scheduleAutoHide()
        } else {
            autoHideJob?.cancel()
        }
        emit?.invoke("onPlaybackStateChange", mapOf(
            "isPaused" to isPaused,
            "isPlaying" to playing,
            "isLoading" to isBuffering,
            "isReadyToSeek" to isReadyToSeek
        ))
    }

    override fun onLoadingChanged(isLoading: Boolean) {
        isBuffering = isLoading
        emit?.invoke("onPlaybackStateChange", mapOf(
            "isPaused" to !isPlaying,
            "isPlaying" to isPlaying,
            "isLoading" to isLoading,
            "isReadyToSeek" to isReadyToSeek
        ))
    }

    override fun onReadyToSeek() {
        isReadyToSeek = true
        emit?.invoke("onPlaybackStateChange", mapOf(
            "isPaused" to !isPlaying,
            "isPlaying" to isPlaying,
            "isLoading" to isBuffering,
            "isReadyToSeek" to true
        ))
    }

    override fun onTracksReady() {
        emit?.invoke("onTracksReady", emptyMap())
    }

    override fun onError(message: String) {
        errorMessage = message
        emit?.invoke("onError", mapOf("error" to message))
    }

    override fun onVideoDimensionsChanged(width: Int, height: Int) {
        Log.i(TAG, "Video dimensions changed: ${width}x${height}")
    }

    override fun onChaptersChanged(chapters: List<Map<String, Any>>) {
        this.chapters = chapters.map {
            ChapterRecord().apply {
                name = it["name"] as? String
                startSec = (it["startSec"] as? Double) ?: 0.0
            }
        }.sortedBy { it.startSec }
    }

    override fun onHDRModeDetected(isHdr: Boolean, fps: Double) {
        onHDRModeDetected?.invoke(isHdr, fps)
    }

    override fun onPlaybackEnded() {
        if (isTearingDown) return
        val next = nextEpisode
        if (next != null && next.countdownSeconds > 0 && !countdownCanceled) {
            cancelCountdown()
            fireNextEpisode(reason = "countdown")
        } else if (next?.stillWatchingRequired == true) {
            isPlaying = false
            showStillWatching = true
        } else {
            emit?.invoke("onPlaybackEnded", mapOf("positionSec" to displayPosition))
            onDismissRequested?.invoke("playbackEnded")
        }
    }

    private fun TrackMenuItemRecord.copy(selected: Boolean): TrackMenuItemRecord {
        val orig = this
        return TrackMenuItemRecord().apply {
            label = orig.label
            jellyfinIndex = orig.jellyfinIndex
            this.selected = selected
            requiresReload = orig.requiresReload
        }
    }
}
