package expo.modules.mpvplayer.nativeplayer

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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
import kotlin.math.min
import kotlin.math.roundToInt

internal fun calculateSubtitleScale(
    baseScale: Double,
    multiplier: Double,
    videoWidth: Int,
    videoHeight: Int,
    surfaceWidth: Int,
    surfaceHeight: Int,
    zoomedToFill: Boolean
): Double {
    val scaled = baseScale * multiplier
    if (videoWidth <= 0 || videoHeight <= 0 || surfaceWidth <= 0 || surfaceHeight <= 0) {
        return scaled
    }

    val widthScale = surfaceWidth.toDouble() / videoWidth
    val heightScale = surfaceHeight.toDouble() / videoHeight
    val containScale = min(widthScale, heightScale)
    val boost = if (containScale < 1) min(1 / containScale, 3.0) else 1.0
    val zoomCompensation =
        if (zoomedToFill) min(widthScale, heightScale) / max(widthScale, heightScale) else 1.0

    return (scaled * boost * zoomCompensation * 100).roundToInt() / 100.0
}

internal fun calculateSubtitleMargin(
    margin: Int,
    isTv: Boolean,
    isPipActive: Boolean,
    surfaceWidth: Int,
    surfaceHeight: Int
): Int =
    if (!isTv && !isPipActive && surfaceHeight > surfaceWidth) {
        (margin * 0.7).roundToInt()
    } else {
        margin
    }

class PlayerViewModel : MPVLayerRenderer.Delegate {

    companion object {
        private const val TAG = "PlayerViewModel"

        /**
         * Delay the FIRST auto-skip until playback has been stable this long.
         * Direct play is always seekable so the wait is invisible there; a
         * transcode is not, and seeking into it too early stalls at 0:00.
         */
        private const val AUTO_SKIP_ARM_DELAY_MS = 1_500L

        /** How long the "… skipped" notice stays up. */
        private const val SKIPPED_NOTICE_MS = 3_000L
    }

    var renderer: MPVLayerRenderer? = null
    var emit: ((String, Map<String, Any?>) -> Unit)? = null
    var onDismissRequested: ((String) -> Unit)? = null
    var onRotateRequested: (() -> Unit)? = null
    var onHDRModeDetected: ((Boolean, Double) -> Unit)? = null
    var onHapticRequested: (() -> Unit)? = null
    var onPlaybackStateSync: (() -> Unit)? = null
    var onMetadataSync: (() -> Unit)? = null
    var isTvChrome: Boolean = false

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
    var subtitleScaleLocked by mutableStateOf(false)
        private set
    var subtitlesAtTop by mutableStateOf(false)
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
    var showSubtitleScaleOverlay by mutableStateOf(false)
    var subtitleScaleOverlayActivity by mutableIntStateOf(0)
    var seekFeedbackVisible by mutableStateOf(false)
    var showExitConfirmation by mutableStateOf(false)
    var tvMenuRoute by mutableStateOf<List<TvMenuScreen>>(emptyList())

    // MARK: - Content State
    var metadata by mutableStateOf<MetadataRecord?>(null)
    var chapters by mutableStateOf<List<ChapterRecord>>(emptyList())
    var segments by mutableStateOf<List<MediaSegmentRecord>>(emptyList())
    var activeSegment by mutableStateOf<MediaSegmentRecord?>(null)
    /** Text of the "… skipped" notice while it is up, null the rest of the time. */
    var skippedSegmentNotice by mutableStateOf<String?>(null)
    /** One automatic skip per segment: re-entering it must not seek again. */
    private val autoSkippedSegmentIds = mutableSetOf<String>()
    /** When playback last became stable, for the auto-skip arming delay. */
    private var autoSkipStableSince: Long? = null
    private var noticeJob: Job? = null
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

    fun str(key: String, fallback: String? = null): String = strings.get(key, fallback)

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
    private var subtitleScaleMultiplier = 1.0
    private var subtitleMarginY: Int? = null
    private var subtitleVideoWidth = 0
    private var subtitleVideoHeight = 0
    private var subtitleSurfaceWidth = 0
    private var subtitleSurfaceHeight = 0
    private var countdownCanceled = false
    private var countdownFired = false

    private var autoHideJob: Job? = null
    private var countdownJob: Job? = null
    private var volumeRevealJob: Job? = null
    private var brightnessRevealJob: Job? = null
    private var unlockRevealJob: Job? = null
    private var doubleTapFeedbackJob: Job? = null
    private var sleepTimerJob: Job? = null
    private var seekFeedbackJob: Job? = null

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
        subtitleScaleMultiplier = config.subtitleStyle?.renderScaleMultiplier ?: 1.0
        subtitleScaleLocked = config.subtitleStyle?.scaleLocked ?: false
        subtitlesAtTop = config.subtitleStyle?.alignY == "top"
        subtitleMarginY = config.subtitleStyle?.marginY
        subtitleVideoWidth = config.stream.videoWidth ?: 0
        subtitleVideoHeight = config.stream.videoHeight ?: 0

        val startPos = config.stream.startPositionSec ?: 0.0
        authoritativePosition = startPos
        displayPosition = startPos
        hasAuthoritativePosition = false
        onMetadataSync?.invoke()
        onPlaybackStateSync?.invoke()
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
        resetAutoSkipState()
        cancelCountdown()
        countdownRemaining = null
        showStillWatching = false
        showEpisodeList = false
        showSubtitleSearch = false
        downloadingResultId = null
        errorMessage = null
        seekFeedbackVisible = false
        showExitConfirmation = false
        tvMenuRoute = emptyList()
        hideSeekFeedback()
    }

    private fun nilSpeed(): Double? = null

    fun updateSegments(newSegments: List<MediaSegmentRecord>) {
        segments = newSegments
        // The modes travel with the segments, so a settings change mid-playback
        // arrives here: clear the per-segment guard or a type just switched to
        // "auto" would never fire for the segment already under the playhead.
        resetAutoSkipState()
        checkSegmentsAndCountdown(displayPosition)
    }

    private fun resetAutoSkipState() {
        autoSkippedSegmentIds.clear()
        autoSkipStableSince = null
        noticeJob?.cancel()
        skippedSegmentNotice = null
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
        onMetadataSync?.invoke()
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

    /**
     * TV: when a focused composable unmounts (skip-segment button, technical
     * info close), Compose focus dies with it and the remote goes dead —
     * the ComposeView keeps view-level focus so keys land in a focus-less
     * tree. Bump this tick to have TvControlsRow re-grab its default focus.
     */
    var tvControlsFocusRestoreTick by mutableStateOf(0)
        private set

    fun restoreTvControlsFocus() {
        showControls()
        tvControlsFocusRestoreTick++
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
        return isPlaying && !isScrubbing && !isBuffering && !showEpisodeList && !showTechnicalInfo && !showSubtitleSearch && tvMenuRoute.isEmpty() && !showExitConfirmation && errorMessage == null
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
        onPlaybackStateSync?.invoke()
        scheduleAutoHide()
    }

    fun seekBy(seconds: Double) {
        val target = max(0.0, displayPosition + seconds)
        seekTo(target)
    }

    fun flashSeekFeedback() {
        seekFeedbackVisible = true
        seekFeedbackJob?.cancel()
        seekFeedbackJob = scope.launch {
            delay(PlayerConstants.TV_SEEK_FEEDBACK_DURATION_MS)
            seekFeedbackVisible = false
        }
    }

    fun hideSeekFeedback() {
        seekFeedbackJob?.cancel()
        seekFeedbackVisible = false
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
        onPlaybackStateSync?.invoke()
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

    // MARK: - Scrubbing (Phone Touch)
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

    // MARK: - Scrubbing (TV Remote Armed Scrub)
    fun beginScrub() {
        if (isScrubbing) return
        wasPlayingBeforeScrub = isPlaying
        if (isPlaying) renderer?.pause()
        isScrubbing = true
        scrubPosition = displayPosition
        autoHideJob?.cancel()
    }

    fun nudgeScrub(deltaSec: Double) {
        val maxDuration = if (duration > 0) duration else Double.MAX_VALUE
        val newPos = (scrubPosition + deltaSec).coerceIn(0.0, maxDuration)
        scrubPosition = newPos
    }

    fun commitScrub() {
        if (!isScrubbing) return
        val target = scrubPosition
        isScrubbing = false
        seekTo(target)
        if (wasPlayingBeforeScrub) {
            renderer?.play()
        }
        scheduleAutoHide()
    }

    fun commitScrubAndPlay() {
        if (!isScrubbing) return
        val target = scrubPosition
        isScrubbing = false
        seekTo(target)
        renderer?.play()
        scheduleAutoHide()
    }

    fun cancelScrub() {
        if (!isScrubbing) return
        isScrubbing = false
        if (wasPlayingBeforeScrub) {
            renderer?.play()
        }
        scheduleAutoHide()
    }

    // MARK: - Chapters
    fun currentChapterIndex(): Int {
        if (chapters.isEmpty()) return -1
        val pos = if (isScrubbing) scrubPosition else displayPosition
        for (i in chapters.indices.reversed()) {
            if (pos >= chapters[i].startSec) {
                return i
            }
        }
        return -1
    }

    fun chapterName(at: Double = displayPosition): String? {
        if (chapters.isEmpty()) return null
        for (i in chapters.indices.reversed()) {
            if (at >= chapters[i].startSec) {
                return chapters[i].name ?: "${i + 1}"
            }
        }
        return null
    }

    fun goToNextChapter() {
        val currentIndex = currentChapterIndex()
        val nextIndex = currentIndex + 1
        if (nextIndex in chapters.indices) {
            seekTo(chapters[nextIndex].startSec)
        }
    }

    fun goToPreviousChapter() {
        val currentIndex = currentChapterIndex()
        if (currentIndex < 0) return
        val currentChapter = chapters[currentIndex]
        val timeInChapter = displayPosition - currentChapter.startSec
        if (timeInChapter > PlayerConstants.CHAPTER_RESTART_THRESHOLD_SEC || currentIndex == 0) {
            seekTo(currentChapter.startSec)
        } else {
            val prevIndex = currentIndex - 1
            if (prevIndex in chapters.indices) {
                seekTo(chapters[prevIndex].startSec)
            }
        }
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
        applySubtitleGeometry()
    }

    fun updateSubtitleGeometry(width: Int, height: Int) {
        subtitleSurfaceWidth = width
        subtitleSurfaceHeight = height
        applySubtitleGeometry()
    }

    fun applySubtitleGeometry() {
        val portraitPhone =
            !isTvChrome && !isPipActive && subtitleSurfaceHeight > subtitleSurfaceWidth
        subtitleMarginY?.let { margin ->
            renderer?.setSubtitleMarginY(
                calculateSubtitleMargin(
                    margin,
                    isTvChrome,
                    isPipActive,
                    subtitleSurfaceWidth,
                    subtitleSurfaceHeight
                )
            )
        }
        renderer?.setSubtitleScale(
            calculateSubtitleScale(
                baseScale = subtitleScale,
                multiplier = subtitleScaleMultiplier,
                videoWidth = subtitleVideoWidth,
                videoHeight = subtitleVideoHeight,
                surfaceWidth = subtitleSurfaceWidth,
                surfaceHeight = subtitleSurfaceHeight,
                zoomedToFill = isZoomedToFill && portraitPhone
            )
        )
    }

    @JvmName("applySubtitleScale")
    fun setSubtitleScale(scale: Double) {
        if (subtitleScaleLocked) return
        subtitleScaleOverlayActivity++
        subtitleScale = scale.coerceIn(0.1, 3.0)
        applySubtitleGeometry()
        emit?.invoke("onSubtitleScaleChange", mapOf("scale" to subtitleScale))
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
        // The list arrives in priority order (Commercial > Recap > Intro >
        // Preview > Outro), so the first match is the one to act on.
        val matched = segments.firstOrNull { pos >= it.startSec && pos < it.endSec }
        activeSegment = matched

        // Auto-skip, mirroring the JS and iOS drivers: one segment at a time,
        // once per segment, and only once playback has been stable for a moment
        // AND the renderer reports it can seek, so the seek lands on a timeline
        // the source can actually serve — a transcode can still be catching up
        // when the fixed delay alone would already have elapsed.
        if (isPlaying && isReadyToSeek && !isBuffering && !isScrubbing) {
            if (autoSkipStableSince == null) autoSkipStableSince = SystemClock.elapsedRealtime()
        } else {
            autoSkipStableSince = null
        }
        val armed = autoSkipStableSince?.let {
            SystemClock.elapsedRealtime() - it >= AUTO_SKIP_ARM_DELAY_MS
        } ?: false

        if (armed && matched != null && matched.skipMode == "auto") {
            val id = "${matched.type}:${matched.startSec}-${matched.endSec}"
            if (autoSkippedSegmentIds.add(id)) {
                skip(matched, automatic = true)
                return
            }
        }

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
            // The countdown must survive a pause: only tick while playing,
            // but keep the loop alive so it resumes when playback does.
            while (rem > 0) {
                delay(500L)
                if (isPlaying) {
                    rem -= 0.5
                    countdownRemaining = max(0.0, rem)
                    if (rem <= 0.0) {
                        fireNextEpisode(reason = "countdown")
                        break
                    }
                }
            }
        }
    }

    fun skipActiveSegment() {
        val segment = activeSegment ?: return
        haptic()
        skip(segment, automatic = false)
    }

    private fun skip(segment: MediaSegmentRecord, automatic: Boolean) {
        // Do NOT disarm the countdown for an outro skip. Seeking lands short of
        // the file end so the natural EOF flow can still autoplay the next
        // episode; disarming would make onPlaybackEnded() fall through to a
        // dismiss instead. fireNextEpisode() is idempotent, so the short
        // countdown that arms over the final seconds cannot fire a duplicate.

        // The reported end of an outro sometimes overshoots the file. Land two
        // seconds short so the natural end-of-video flow still runs, and do
        // nothing at all when that target is already behind the playhead, which
        // would otherwise rewind.
        var target = segment.endSec
        if (segment.type == "Outro" && duration > 0 && target >= duration) {
            target = max(0.0, duration - 2.0)
            if (target <= displayPosition) return
        }

        seekTo(target)

        // An automatic skip is otherwise silent and reads as the video jumping
        // on its own. A manual one needs no notice: the user just tapped for it.
        if (automatic) showSkippedNotice(segment.type)
    }

    /** Pill label for a segment type. */
    fun skipLabel(type: String): String = when (type) {
        "Outro" -> strings.get("skipCredits", "Skip credits")
        "Recap" -> strings.get("skipRecap", "Skip recap")
        "Commercial" -> strings.get("skipCommercial", "Skip commercial")
        "Preview" -> strings.get("skipPreview", "Skip preview")
        else -> strings.get("skipIntro", "Skip intro")
    }

    /**
     * "… skipped" notice for a segment type. Whole sentences rather than a
     * template: the agreement follows the noun, so only the translator can
     * write them.
     */
    private fun skippedNoticeText(type: String): String = when (type) {
        "Outro" -> strings.get("segmentSkippedOutro", "Credits skipped")
        "Recap" -> strings.get("segmentSkippedRecap", "Recap skipped")
        "Commercial" -> strings.get("segmentSkippedCommercial", "Commercial skipped")
        "Preview" -> strings.get("segmentSkippedPreview", "Preview skipped")
        else -> strings.get("segmentSkippedIntro", "Intro skipped")
    }

    private fun showSkippedNotice(type: String) {
        skippedSegmentNotice = skippedNoticeText(type)
        noticeJob?.cancel()
        noticeJob = scope.launch {
            delay(SKIPPED_NOTICE_MS)
            skippedSegmentNotice = null
        }
    }

    /**
     * Kill the countdown for good before an episode change: cancelCountdown()
     * alone leaves countdownCanceled false, so checkSegmentsAndCountdown can
     * re-arm it while the next episode is still loading and fire a second
     * advance.
     */
    fun disarmCountdownForEpisodeChange() {
        countdownCanceled = true
        cancelCountdown()
        countdownRemaining = null
    }

    fun playNextEpisode() {
        haptic()
        disarmCountdownForEpisodeChange()
        fireNextEpisode(reason = "userTap")
    }

    fun playNextEpisodeNow() {
        haptic()
        disarmCountdownForEpisodeChange()
        fireNextEpisode(reason = "userTap")
    }

    fun playPreviousEpisode() {
        haptic()
        disarmCountdownForEpisodeChange()
        emit?.invoke("onPreviousEpisodeRequested", mapOf(
            "positionSec" to displayPosition
        ))
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
        // Idempotent: the countdown tick and the EOF handler can both reach
        // here for the same transition. Emit onNextEpisodeRequested only once.
        if (countdownFired) return
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

    // MARK: - TV Menus
    fun openTvMenu(screen: TvMenuScreen) {
        tvMenuRoute = listOf(screen)
        menuInteractionStarted()
    }

    fun pushTvMenu(screen: TvMenuScreen) {
        tvMenuRoute = tvMenuRoute + screen
        menuInteractionStarted()
    }

    fun popTvMenu(): Boolean {
        if (tvMenuRoute.isNotEmpty()) {
            tvMenuRoute = tvMenuRoute.dropLast(1)
            if (tvMenuRoute.isNotEmpty()) {
                menuInteractionStarted()
            } else {
                scheduleAutoHide()
            }
            return true
        }
        return false
    }

    fun closeTvMenu() {
        tvMenuRoute = emptyList()
        scheduleAutoHide()
    }

    // MARK: - Exit Confirmation
    fun requestExitConfirmation() {
        cancelCountdown()
        showExitConfirmation = true
    }

    fun dismissExitConfirmation() {
        showExitConfirmation = false
    }

    fun confirmExit() {
        showExitConfirmation = false
        onDismissRequested?.invoke("closeButton")
    }

    // MARK: - Episode List & Subtitle Search
    fun selectEpisode(itemId: String) {
        haptic()
        disarmCountdownForEpisodeChange()
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

    fun closeSubtitleSearch() {
        showSubtitleSearch = false
        scheduleAutoHide()
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
        seekFeedbackJob?.cancel()
        scope.cancel()
    }

    // MARK: - MPVLayerRenderer.Delegate Implementation

    override fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double) {
        authoritativePosition = position
        if (this.duration != duration) {
            this.duration = duration
            onMetadataSync?.invoke()
        }
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
        onPlaybackStateSync?.invoke()
        emit?.invoke("onPlaybackStateChange", mapOf(
            "isPaused" to isPaused,
            "isPlaying" to playing,
            "isLoading" to isBuffering,
            "isReadyToSeek" to isReadyToSeek
        ))
    }

    override fun onLoadingChanged(isLoading: Boolean) {
        isBuffering = isLoading
        onPlaybackStateSync?.invoke()
        emit?.invoke("onPlaybackStateChange", mapOf(
            "isPaused" to !isPlaying,
            "isPlaying" to isPlaying,
            "isLoading" to isLoading,
            "isReadyToSeek" to isReadyToSeek
        ))
    }

    override fun onReadyToSeek() {
        isReadyToSeek = true
        onPlaybackStateSync?.invoke()
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
        subtitleVideoWidth = width
        subtitleVideoHeight = height
        applySubtitleGeometry()
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
