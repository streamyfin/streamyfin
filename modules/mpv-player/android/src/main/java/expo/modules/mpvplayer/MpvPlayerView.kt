package expo.modules.mpvplayer

import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.graphics.SurfaceTexture
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Configuration for loading a video
 */
data class VideoLoadConfig(
    val url: String,
    val headers: Map<String, String>? = null,
    val externalSubtitles: List<String>? = null,
    val startPosition: Double? = null,
    val autoplay: Boolean = true,
    val initialSubtitleId: Int? = null,
    val initialAudioId: Int? = null,
    val voDriver: String? = null
)

/**
 * MpvPlayerView - ExpoView that hosts the MPV player.
 * Uses TextureView for reliable Picture-in-Picture support.
 */
class MpvPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
    MPVLayerRenderer.Delegate, TextureView.SurfaceTextureListener {

    companion object {
        private const val TAG = "MpvPlayerView"
    }

    // Event dispatchers
    val onLoad by EventDispatcher()
    val onPlaybackStateChange by EventDispatcher()
    val onProgress by EventDispatcher()
    val onError by EventDispatcher()
    val onTracksReady by EventDispatcher()
    val onPictureInPictureChange by EventDispatcher()
    // SyncPlay: when `syncPlayDelegated == true`, PiP playback controls
    // (play / pause / skip) emit these events instead of driving MPV
    // directly, so JS can route the action through the SyncPlay
    // controller (server -> group broadcast -> all clients). Default
    // behavior (non-SyncPlay) is unchanged.
    val onPipPlayRequest by EventDispatcher()
    val onPipPauseRequest by EventDispatcher()
    val onPipSkipRequest by EventDispatcher()

    var syncPlayDelegated: Boolean = false

    private var textureView: TextureView
    private var renderer: MPVLayerRenderer? = null
    private var pipController: PiPController? = null

    private var currentUrl: String? = null
    private var cachedPosition: Double = 0.0
    private var cachedDuration: Double = 0.0
    private var intendedPlayState: Boolean = false
    private var surfaceReady: Boolean = false
    private var pendingConfig: VideoLoadConfig? = null
    private var rendererStarted: Boolean = false
    private var pendingSurface: Surface? = null
    private var surfaceTexture: SurfaceTexture? = null

    // PiP state tracking
    private var isWaitingForPiPTransition: Boolean = false
    private var isPiPSurfaceForced: Boolean = false
    private val pipHandler = Handler(Looper.getMainLooper())

    init {
        setBackgroundColor(Color.BLACK)

        // Create TextureView for video rendering (composites into app window for PiP support)
        textureView = TextureView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            surfaceTextureListener = this@MpvPlayerView
        }
        addView(textureView)

        // Initialize PiP controller with Expo's AppContext for proper activity access
        pipController = PiPController(context, appContext)
        pipController?.setPlayerView(textureView)
        pipController?.delegate = object : PiPController.Delegate {
            override fun onPlay() {
                if (syncPlayDelegated) {
                    onPipPlayRequest(mapOf<String, Any>())
                    return
                }
                play()
            }

            override fun onPause() {
                if (syncPlayDelegated) {
                    onPipPauseRequest(mapOf<String, Any>())
                    return
                }
                pause()
            }

            override fun onSeekBy(seconds: Double) {
                if (syncPlayDelegated) {
                    val target = (cachedPosition + seconds).coerceAtLeast(0.0)
                    onPipSkipRequest(
                        mapOf(
                            "targetSeconds" to target,
                            "intervalSeconds" to seconds
                        )
                    )
                    return
                }
                seekBy(seconds)
            }

            override fun onPictureInPictureModeChanged(isInPiP: Boolean) {
                if (isInPiP) {
                    if (!isWaitingForPiPTransition) {
                        isWaitingForPiPTransition = true
                        pipHandler.removeCallbacksAndMessages(null)
                        for (delay in longArrayOf(500, 1000, 1500, 2000)) {
                            pipHandler.postDelayed({ forcePiPBufferSize() }, delay)
                        }
                    }
                } else {
                    isWaitingForPiPTransition = false
                    pipHandler.removeCallbacksAndMessages(null)
                    restoreFromPiP()
                }
                onPictureInPictureChange(mapOf("isActive" to isInPiP))
            }
        }

        // Renderer is created lazily in loadVideo once we have the voDriver setting
        renderer = MPVLayerRenderer(context)
        renderer?.delegate = this
    }

    /**
     * Start the renderer with the given VO driver.
     * Called lazily on first loadVideo so the voDriver setting is available.
     */
    private fun ensureRendererStarted(voDriver: String?) {
        if (rendererStarted) return

        try {
            renderer?.start(voDriver ?: "gpu-next")
            rendererStarted = true

            pendingSurface?.let { surface ->
                renderer?.attachSurface(surface)
                pendingSurface = null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start renderer: ${e.message}")
            onError(mapOf("error" to "Failed to start renderer: ${e.message}"))
        }
    }

    // MARK: - TextureView.SurfaceTextureListener

    override fun onSurfaceTextureAvailable(surfaceTexture: SurfaceTexture, width: Int, height: Int) {
        this.surfaceTexture = surfaceTexture
        val surface = Surface(surfaceTexture)
        surfaceTexture.setDefaultBufferSize(width, height)
        surfaceReady = true

        if (rendererStarted) {
            renderer?.attachSurface(surface)
        } else {
            pendingSurface = surface
        }

        // If we have a pending load, execute it now
        pendingConfig?.let { config ->
            ensureRendererStarted(config.voDriver)
            loadVideoInternal(config)
            pendingConfig = null
        }
    }

    override fun onSurfaceTextureSizeChanged(surfaceTexture: SurfaceTexture, width: Int, height: Int) {
        surfaceTexture.setDefaultBufferSize(width, height)
        renderer?.updateSurfaceSize(width, height)
    }

    override fun onSurfaceTextureDestroyed(surfaceTexture: SurfaceTexture): Boolean {
        this.surfaceTexture = null
        surfaceReady = false
        renderer?.detachSurface()
        return false // mpv manages the SurfaceTexture
    }

    override fun onSurfaceTextureUpdated(surfaceTexture: SurfaceTexture) {
        // Called every frame — no action needed, mpv drives rendering directly
    }

    // MARK: - Video Loading

    fun loadVideo(config: VideoLoadConfig) {
        // Skip reload if same URL is already playing
        if (currentUrl == config.url) {
            return
        }

        if (!surfaceReady) {
            // Surface not ready, store config and load when ready
            pendingConfig = config
            return
        }

        // Ensure renderer is started with the configured VO driver
        ensureRendererStarted(config.voDriver)

        loadVideoInternal(config)
    }

    private fun loadVideoInternal(config: VideoLoadConfig) {
        currentUrl = config.url

        renderer?.load(
            url = config.url,
            headers = config.headers,
            startPosition = config.startPosition,
            externalSubtitles = config.externalSubtitles,
            initialSubtitleId = config.initialSubtitleId,
            initialAudioId = config.initialAudioId
        )

        if (config.autoplay) {
            play()
        }

        onLoad(mapOf("url" to config.url))
    }

    // Convenience method for simple loads
    fun loadVideo(url: String, headers: Map<String, String>? = null) {
        loadVideo(VideoLoadConfig(url = url, headers = headers))
    }

    // MARK: - Playback Controls

    fun play() {
        intendedPlayState = true
        renderer?.play()
        pipController?.setPlaybackRate(1.0)
    }

    fun pause() {
        intendedPlayState = false
        renderer?.pause()
        pipController?.setPlaybackRate(0.0)
    }

    fun seekTo(position: Double) {
        renderer?.seekTo(position)
    }

    fun seekBy(offset: Double) {
        renderer?.seekBy(offset)
    }

    fun setSpeed(speed: Double) {
        renderer?.setSpeed(speed)
    }

    fun getSpeed(): Double {
        return renderer?.getSpeed() ?: 1.0
    }

    fun isPaused(): Boolean {
        return renderer?.isPausedState ?: true
    }

    fun getCurrentPosition(): Double {
        return cachedPosition
    }

    fun getDuration(): Double {
        return cachedDuration
    }

    // MARK: - Picture in Picture

    fun startPictureInPicture() {
        isWaitingForPiPTransition = true
        pipController?.startPictureInPicture()

        // Resize buffer to match PiP window after animation settles
        pipHandler.removeCallbacksAndMessages(null)
        for (delay in longArrayOf(500, 1000, 1500, 2000)) {
            pipHandler.postDelayed({ forcePiPBufferSize() }, delay)
        }
    }

    /**
     * Resize the SurfaceTexture buffer AND TextureView layout to match the PiP
     * visible rect so mpv renders at the PiP window's actual dimensions.
     */
    private fun forcePiPBufferSize() {
        if (!isWaitingForPiPTransition || !surfaceReady) return

        val rect = Rect()
        textureView.getGlobalVisibleRect(rect)
        val visW = rect.width()
        val visH = rect.height()
        val vw = textureView.width
        val vh = textureView.height

        if (visW <= 0 || visH <= 0 || (vw == visW && vh == visH)) return

        surfaceTexture?.setDefaultBufferSize(visW, visH)
        renderer?.updateSurfaceSize(visW, visH)

        // Force TextureView layout to match PiP visible area.
        // layoutParams alone doesn't work during PiP because the parent
        // never re-lays out its children.
        textureView.measure(
            View.MeasureSpec.makeMeasureSpec(visW, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(visH, View.MeasureSpec.EXACTLY)
        )
        textureView.layout(0, 0, visW, visH)
        isPiPSurfaceForced = true
    }

    private fun restoreFromPiP() {
        if (!isPiPSurfaceForced) return
        isPiPSurfaceForced = false

        val lp = textureView.layoutParams
        lp.width = ViewGroup.LayoutParams.MATCH_PARENT
        lp.height = ViewGroup.LayoutParams.MATCH_PARENT
        textureView.layoutParams = lp
        textureView.requestLayout()
    }

    fun stopPictureInPicture() {
        isWaitingForPiPTransition = false
        pipHandler.removeCallbacksAndMessages(null)
        pipController?.stopPictureInPicture()
    }

    fun isPictureInPictureSupported(): Boolean {
        return pipController?.isPictureInPictureSupported() ?: false
    }

    fun isPictureInPictureActive(): Boolean {
        return pipController?.isPictureInPictureActive() ?: false
    }

    // MARK: - Subtitle Controls

    fun getSubtitleTracks(): List<Map<String, Any>> {
        return renderer?.getSubtitleTracks() ?: emptyList()
    }

    fun setSubtitleTrack(trackId: Int) {
        renderer?.setSubtitleTrack(trackId)
    }

    fun disableSubtitles() {
        renderer?.disableSubtitles()
    }

    fun getCurrentSubtitleTrack(): Int {
        return renderer?.getCurrentSubtitleTrack() ?: 0
    }

    fun addSubtitleFile(url: String, select: Boolean = true) {
        renderer?.addSubtitleFile(url, select)
    }

    // MARK: - Subtitle Positioning

    fun setSubtitlePosition(position: Int) {
        renderer?.setSubtitlePosition(position)
    }

    fun setSubtitleScale(scale: Double) {
        renderer?.setSubtitleScale(scale)
    }

    fun setSubtitleMarginY(margin: Int) {
        renderer?.setSubtitleMarginY(margin)
    }

    fun setSubtitleAlignX(alignment: String) {
        renderer?.setSubtitleAlignX(alignment)
    }

    fun setSubtitleAlignY(alignment: String) {
        renderer?.setSubtitleAlignY(alignment)
    }

    fun setSubtitleFontSize(size: Int) {
        renderer?.setSubtitleFontSize(size)
    }

    fun setSubtitleBorderStyle(style: String) {
        renderer?.setSubtitleBorderStyle(style)
    }

    fun setSubtitleBackgroundColor(color: String) {
        renderer?.setSubtitleBackgroundColor(color)
    }

    fun setSubtitleAssOverride(mode: String) {
        renderer?.setSubtitleAssOverride(mode)
    }

    // MARK: - Audio Track Controls

    fun getAudioTracks(): List<Map<String, Any>> {
        return renderer?.getAudioTracks() ?: emptyList()
    }

    fun setAudioTrack(trackId: Int) {
        renderer?.setAudioTrack(trackId)
    }

    fun getCurrentAudioTrack(): Int {
        return renderer?.getCurrentAudioTrack() ?: 0
    }

    // MARK: - Video Scaling

    private var _isZoomedToFill: Boolean = false

    fun setZoomedToFill(zoomed: Boolean) {
        _isZoomedToFill = zoomed
        renderer?.setZoomedToFill(zoomed)
    }

    fun isZoomedToFill(): Boolean {
        return _isZoomedToFill
    }

    // MARK: - Technical Info

    fun getTechnicalInfo(): Map<String, Any> {
        return renderer?.getTechnicalInfo() ?: emptyMap()
    }

    // MARK: - MPVLayerRenderer.Delegate

    override fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double) {
        cachedPosition = position
        cachedDuration = duration

        // Update PiP progress
        if (pipController?.isPictureInPictureActive() == true) {
            pipController?.setCurrentTime(position, duration)
        }

        onProgress(mapOf(
            "position" to position,
            "duration" to duration,
            "progress" to if (duration > 0) position / duration else 0.0,
            "cacheSeconds" to cacheSeconds
        ))
    }

    override fun onPauseChanged(isPaused: Boolean) {
        pipController?.setPlaybackRate(if (isPaused) 0.0 else 1.0)

        onPlaybackStateChange(mapOf(
            "isPaused" to isPaused,
            "isPlaying" to !isPaused
        ))
    }

    override fun onLoadingChanged(isLoading: Boolean) {
        onPlaybackStateChange(mapOf(
            "isLoading" to isLoading
        ))
    }

    override fun onReadyToSeek() {
        onPlaybackStateChange(mapOf(
            "isReadyToSeek" to true
        ))
    }

    override fun onTracksReady() {
        onTracksReady(emptyMap<String, Any>())
    }

    override fun onVideoDimensionsChanged(width: Int, height: Int) {
        pipController?.setVideoDimensions(width, height)
    }

    override fun onError(message: String) {
        onError(mapOf("error" to message))
    }

    // MARK: - Cleanup

    fun cleanup() {
        isWaitingForPiPTransition = false
        pipHandler.removeCallbacksAndMessages(null)
        pipController?.stopPictureInPicture()
        renderer?.stop()
        surfaceTexture = null
        surfaceReady = false
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        cleanup()
    }
}
