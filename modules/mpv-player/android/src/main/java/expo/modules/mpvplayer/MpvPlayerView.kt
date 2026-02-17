package expo.modules.mpvplayer

import android.content.Context
import android.graphics.Color
import android.os.Build
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.widget.FrameLayout
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
    val initialAudioId: Int? = null
)

/**
 * MpvPlayerView - ExpoView that hosts the MPV player.
 * This mirrors the iOS MpvPlayerView implementation.
 */
class MpvPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext), 
    MPVLayerRenderer.Delegate, SurfaceHolder.Callback {
    
    companion object {
        private const val TAG = "MpvPlayerView"
    }
    
    // Event dispatchers
    val onLoad by EventDispatcher()
    val onPlaybackStateChange by EventDispatcher()
    val onProgress by EventDispatcher()
    val onError by EventDispatcher()
    val onTracksReady by EventDispatcher()
    
    private var surfaceView: SurfaceView
    private var renderer: MPVLayerRenderer? = null
    private var pipController: PiPController? = null
    
    private var currentUrl: String? = null
    private var cachedPosition: Double = 0.0
    private var cachedDuration: Double = 0.0
    private var intendedPlayState: Boolean = false
    private var surfaceReady: Boolean = false
    private var pendingConfig: VideoLoadConfig? = null
    
    init {
        setBackgroundColor(Color.BLACK)
        
        // Create SurfaceView for video rendering
        surfaceView = SurfaceView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            holder.addCallback(this@MpvPlayerView)
        }
        addView(surfaceView)
        
        // Initialize renderer
        renderer = MPVLayerRenderer(context)
        renderer?.delegate = this
        
        // Initialize PiP controller with Expo's AppContext for proper activity access
        pipController = PiPController(context, appContext)
        pipController?.setPlayerView(surfaceView)
        pipController?.delegate = object : PiPController.Delegate {
            override fun onPlay() {
                play()
            }
            
            override fun onPause() {
                pause()
            }
            
            override fun onSeekBy(seconds: Double) {
                seekBy(seconds)
            }
        }
        
        // Start the renderer
        try {
            renderer?.start()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start renderer: ${e.message}")
            onError(mapOf("error" to "Failed to start renderer: ${e.message}"))
        }
    }
    
    // MARK: - SurfaceHolder.Callback
    
    override fun surfaceCreated(holder: SurfaceHolder) {
        Log.i(TAG, "Surface created")
        surfaceReady = true
        renderer?.attachSurface(holder.surface)
        
        // If we have a pending load, execute it now
        pendingConfig?.let { config ->
            loadVideoInternal(config)
            pendingConfig = null
        }
    }
    
    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        Log.i(TAG, "Surface changed: ${width}x${height}")
        // Update MPV with the new surface size (Findroid approach)
        renderer?.updateSurfaceSize(width, height)
    }
    
    override fun surfaceDestroyed(holder: SurfaceHolder) {
        Log.i(TAG, "Surface destroyed")
        surfaceReady = false
        renderer?.detachSurface()
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
        Log.i(TAG, "startPictureInPicture called")
        pipController?.startPictureInPicture()
    }
    
    fun stopPictureInPicture() {
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
        // Sync PiP playback rate
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
        // Update PiP controller with video dimensions for proper aspect ratio
        pipController?.setVideoDimensions(width, height)
    }
    
    override fun onError(message: String) {
        onError(mapOf("error" to message))
    }
    
    // MARK: - Cleanup
    
    fun cleanup() {
        pipController?.stopPictureInPicture()
        renderer?.stop()
        surfaceView.holder.removeCallback(this)
    }
    
    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        cleanup()
    }
}
