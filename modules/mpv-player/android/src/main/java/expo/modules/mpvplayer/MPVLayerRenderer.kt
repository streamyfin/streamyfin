package expo.modules.mpvplayer

import android.content.Context
import android.content.res.AssetManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Surface
import java.io.File
import java.io.FileOutputStream

/**
 * MPV renderer that wraps libmpv for video playback.
 * This mirrors the iOS MPVLayerRenderer implementation.
 */
class MPVLayerRenderer(private val context: Context) : MPVLib.EventObserver {
    
    companion object {
        private const val TAG = "MPVLayerRenderer"
        
        // Property observation format types
        const val MPV_FORMAT_NONE = 0
        const val MPV_FORMAT_STRING = 1
        const val MPV_FORMAT_OSD_STRING = 2
        const val MPV_FORMAT_FLAG = 3
        const val MPV_FORMAT_INT64 = 4
        const val MPV_FORMAT_DOUBLE = 5
        const val MPV_FORMAT_NODE = 6
    }
    
    interface Delegate {
        fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double)
        fun onPauseChanged(isPaused: Boolean)
        fun onLoadingChanged(isLoading: Boolean)
        fun onReadyToSeek()
        fun onTracksReady()
        fun onError(message: String)
        fun onVideoDimensionsChanged(width: Int, height: Int)
    }
    
    var delegate: Delegate? = null
    
    private val mainHandler = Handler(Looper.getMainLooper())
    
    private var surface: Surface? = null
    private var isRunning = false
    private var isStopping = false
    
    // Cached state
    private var cachedPosition: Double = 0.0
    private var cachedDuration: Double = 0.0
    private var cachedCacheSeconds: Double = 0.0
    private var _isPaused: Boolean = true
    private var _isLoading: Boolean = false
    private var _playbackSpeed: Double = 1.0
    private var isReadyToSeek: Boolean = false

    // Progress update throttling - CRITICAL for performance!
    // DO NOT REMOVE THIS THROTTLE - it is essential for battery life and CPU efficiency.
    //
    // Without throttling, time-pos fires every video frame (24+ times/sec at 24fps).
    // Each update crosses the React Native JS bridge, which is expensive on mobile.
    // Even if the JS side does nothing, 24+ bridge calls/sec wastes CPU and battery.
    //
    // Throttling to 1 update/sec during normal playback is sufficient for:
    // - Progress bar updates (users can't perceive 1-second granularity)
    // - Playback position tracking
    // - Any JS-side logic that needs current position
    //
    // During seeking, we bypass the throttle for responsive scrubbing.
    // This optimization reduced CPU usage by ~50% for downloaded file playback.
    private var lastProgressUpdateTime: Long = 0
    private var _isSeeking: Boolean = false
    
    // Video dimensions
    private var _videoWidth: Int = 0
    private var _videoHeight: Int = 0
    
    val videoWidth: Int
        get() = _videoWidth
    
    val videoHeight: Int
        get() = _videoHeight
    
    // Current video config
    private var currentUrl: String? = null
    private var currentHeaders: Map<String, String>? = null
    private var pendingExternalSubtitles: List<String> = emptyList()
    private var initialSubtitleId: Int? = null
    private var initialAudioId: Int? = null
    
    val isPausedState: Boolean
        get() = _isPaused
    
    val currentPosition: Double
        get() = cachedPosition
    
    val duration: Double
        get() = cachedDuration
    
    fun start() {
        if (isRunning) return
        
        try {
            MPVLib.create(context)
            MPVLib.addObserver(this)
            
            /**
             * Create mpv config directory and copy font files to ensure SubRip subtitles load properly on Android.
             *
             * Technical Background:
             * ====================
             * On Android, mpv requires access to a font file to render text-based subtitles, particularly SubRip (.srt)
             * format subtitles. Without an available font in the config directory, mpv will fail to display subtitles
             * even when subtitle tracks are properly detected and loaded.
             *
             * Why This Is Necessary:
             * =====================
             * 1. Android's font system is isolated from native libraries like mpv. While Android has system fonts,
             *    mpv cannot access them directly due to sandboxing and library isolation.
             *
             * 2. SubRip subtitles require a font to render text overlay on video. When no font is available in the
             *    configured directory, mpv either:
             *    - Fails silently (subtitles don't appear)
             *    - Falls back to a default font that may not support the required character set
             *    - Crashes or produces rendering errors
             *
             * 3. By placing a font file (font.ttf) in mpv's config directory and setting that directory via
             *    MPVLib.setOptionString("config-dir", ...), we ensure mpv has a known, accessible font source.
             *
             * Reference:
             * =========
             * This workaround is documented in the mpv-android project:
             * https://github.com/mpv-android/mpv-android/issues/96
             *
             * The issue discusses that without a font in the config directory, SubRip subtitles fail to load
             * properly on Android, and the solution is to copy a font file to a known location that mpv can access.
             */
            // Create mpv config directory and copy font files
            val mpvDir = File(context.getExternalFilesDir(null) ?: context.filesDir, "mpv")
            //Log.i(TAG, "mpv config dir: $mpvDir")
            if (!mpvDir.exists()) mpvDir.mkdirs()
            // This needs to be named `subfont.ttf` else it won't work
            arrayOf("subfont.ttf").forEach { fileName ->
                val file = File(mpvDir, fileName)
                if (file.exists()) return@forEach
                context.assets
                    .open(fileName, AssetManager.ACCESS_STREAMING)
                    .copyTo(FileOutputStream(file))
            }
            MPVLib.setOptionString("config", "yes")
            MPVLib.setOptionString("config-dir", mpvDir.path)
            
            // Configure mpv options before initialization (based on Findroid)
            MPVLib.setOptionString("vo", "gpu")
            MPVLib.setOptionString("gpu-context", "android")
            MPVLib.setOptionString("opengl-es", "yes")
            
            // Hardware video decoding
            MPVLib.setOptionString("hwdec", "mediacodec-copy")
            MPVLib.setOptionString("hwdec-codecs", "h264,hevc,mpeg4,mpeg2video,vp8,vp9,av1")
            
            // Cache settings for better network streaming
            MPVLib.setOptionString("cache", "yes")
            MPVLib.setOptionString("cache-pause-initial", "yes")
            MPVLib.setOptionString("demuxer-max-bytes", "150MiB")
            MPVLib.setOptionString("demuxer-max-back-bytes", "75MiB")
            MPVLib.setOptionString("demuxer-readahead-secs", "20")
            
            // Seeking optimization - faster seeking at the cost of less precision
            // Use keyframe seeking by default (much faster for network streams)
            MPVLib.setOptionString("hr-seek", "no")
            // Drop frames during seeking for faster response
            MPVLib.setOptionString("hr-seek-framedrop", "yes")
            
            // Subtitle settings
            MPVLib.setOptionString("sub-scale-with-window", "no")
            MPVLib.setOptionString("sub-use-margins", "no")
            MPVLib.setOptionString("subs-match-os-language", "yes")
            MPVLib.setOptionString("subs-fallback", "yes")
            
            // Important: Start with force-window=no, will be set to yes when surface is attached
            MPVLib.setOptionString("force-window", "no")
            MPVLib.setOptionString("keep-open", "always")
            
            MPVLib.initialize()
            
            // Observe properties
            observeProperties()
            
            isRunning = true
            Log.i(TAG, "MPV renderer started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start MPV renderer: ${e.message}")
            delegate?.onError("Failed to start renderer: ${e.message}")
        }
    }
    
    fun stop() {
        if (isStopping) return
        if (!isRunning) return
        
        isStopping = true
        isRunning = false
        
        try {
            MPVLib.removeObserver(this)
            MPVLib.detachSurface()
            MPVLib.destroy()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping MPV: ${e.message}")
        }
        
        isStopping = false
    }
    
    /**
     * Attach surface and re-enable video output.
     * Based on Findroid's implementation.
     */
    fun attachSurface(surface: Surface) {
        this.surface = surface
        if (isRunning) {
            MPVLib.attachSurface(surface)
            // Re-enable video output after attaching surface (Findroid approach)
            MPVLib.setOptionString("force-window", "yes")
            MPVLib.setOptionString("vo", "gpu")
            Log.i(TAG, "Surface attached, video output re-enabled")
        }
    }
    
    /**
     * Detach surface and disable video output.
     * Based on Findroid's implementation.
     */
    fun detachSurface() {
        this.surface = null
        if (isRunning) {
            try {
                // Disable video output before detaching surface (Findroid approach)
                MPVLib.setOptionString("vo", "null")
                MPVLib.setOptionString("force-window", "no")
                Log.i(TAG, "Video output disabled before surface detach")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to disable video output: ${e.message}")
            }
            
            MPVLib.detachSurface()
        }
    }
    
    /**
     * Updates the surface size. Called from surfaceChanged.
     * Based on Findroid's implementation.
     */
    fun updateSurfaceSize(width: Int, height: Int) {
        if (isRunning) {
            MPVLib.setPropertyString("android-surface-size", "${width}x$height")
            Log.i(TAG, "Surface size updated: ${width}x$height")
        }
    }
    
    fun load(
        url: String,
        headers: Map<String, String>? = null,
        startPosition: Double? = null,
        externalSubtitles: List<String>? = null,
        initialSubtitleId: Int? = null,
        initialAudioId: Int? = null
    ) {
        currentUrl = url
        currentHeaders = headers
        pendingExternalSubtitles = externalSubtitles ?: emptyList()
        this.initialSubtitleId = initialSubtitleId
        this.initialAudioId = initialAudioId
        
        _isLoading = true
        isReadyToSeek = false
        mainHandler.post { delegate?.onLoadingChanged(true) }
        
        // Stop previous playback
        MPVLib.command(arrayOf("stop"))
        
        // Set HTTP headers if provided
        updateHttpHeaders(headers)
        
        // Set start position
        if (startPosition != null && startPosition > 0) {
            MPVLib.setPropertyString("start", String.format("%.2f", startPosition))
        } else {
            MPVLib.setPropertyString("start", "0")
        }
        
        // Set initial audio track if specified
        if (initialAudioId != null && initialAudioId > 0) {
            setAudioTrack(initialAudioId)
        }
        
        // Set initial subtitle track if no external subs
        if (pendingExternalSubtitles.isEmpty()) {
            if (initialSubtitleId != null) {
                setSubtitleTrack(initialSubtitleId)
            } else {
                disableSubtitles()
            }
        } else {
            disableSubtitles()
        }
        
        // Load the file
        MPVLib.command(arrayOf("loadfile", url, "replace"))
    }
    
    fun reloadCurrentItem() {
        currentUrl?.let { url ->
            load(url, currentHeaders)
        }
    }
    
    private fun updateHttpHeaders(headers: Map<String, String>?) {
        if (headers.isNullOrEmpty()) {
            // Clear headers
            return
        }
        
        val headerString = headers.entries.joinToString("\r\n") { "${it.key}: ${it.value}" }
        MPVLib.setPropertyString("http-header-fields", headerString)
    }
    
    private fun observeProperties() {
        MPVLib.observeProperty("duration", MPV_FORMAT_DOUBLE)
        MPVLib.observeProperty("time-pos", MPV_FORMAT_DOUBLE)
        MPVLib.observeProperty("pause", MPV_FORMAT_FLAG)
        MPVLib.observeProperty("track-list/count", MPV_FORMAT_INT64)
        MPVLib.observeProperty("paused-for-cache", MPV_FORMAT_FLAG)
        MPVLib.observeProperty("demuxer-cache-duration", MPV_FORMAT_DOUBLE)
        // Video dimensions for PiP aspect ratio
        MPVLib.observeProperty("video-params/w", MPV_FORMAT_INT64)
        MPVLib.observeProperty("video-params/h", MPV_FORMAT_INT64)
    }
    
    // MARK: - Playback Controls
    
    fun play() {
        MPVLib.setPropertyBoolean("pause", false)
    }
    
    fun pause() {
        MPVLib.setPropertyBoolean("pause", true)
    }
    
    fun togglePause() {
        if (_isPaused) play() else pause()
    }
    
    fun seekTo(seconds: Double) {
        val clamped = maxOf(0.0, seconds)
        cachedPosition = clamped
        MPVLib.command(arrayOf("seek", clamped.toString(), "absolute"))
    }
    
    fun seekBy(seconds: Double) {
        val newPosition = maxOf(0.0, cachedPosition + seconds)
        cachedPosition = newPosition
        MPVLib.command(arrayOf("seek", seconds.toString(), "relative"))
    }
    
    fun setSpeed(speed: Double) {
        _playbackSpeed = speed
        MPVLib.setPropertyDouble("speed", speed)
    }
    
    fun getSpeed(): Double {
        return MPVLib.getPropertyDouble("speed") ?: _playbackSpeed
    }
    
    // MARK: - Subtitle Controls
    
    fun getSubtitleTracks(): List<Map<String, Any>> {
        val tracks = mutableListOf<Map<String, Any>>()
        
        val trackCount = MPVLib.getPropertyInt("track-list/count") ?: 0
        
        for (i in 0 until trackCount) {
            val trackType = MPVLib.getPropertyString("track-list/$i/type") ?: continue
            if (trackType != "sub") continue
            
            val trackId = MPVLib.getPropertyInt("track-list/$i/id") ?: continue
            val track = mutableMapOf<String, Any>("id" to trackId)
            
            MPVLib.getPropertyString("track-list/$i/title")?.let { track["title"] = it }
            MPVLib.getPropertyString("track-list/$i/lang")?.let { track["lang"] = it }
            
            val selected = MPVLib.getPropertyBoolean("track-list/$i/selected") ?: false
            track["selected"] = selected
            
            tracks.add(track)
        }
        
        return tracks
    }
    
    fun setSubtitleTrack(trackId: Int) {
        Log.i(TAG, "setSubtitleTrack: setting sid to $trackId")
        if (trackId < 0) {
            MPVLib.setPropertyString("sid", "no")
        } else {
            MPVLib.setPropertyInt("sid", trackId)
        }
    }
    
    fun disableSubtitles() {
        MPVLib.setPropertyString("sid", "no")
    }
    
    fun getCurrentSubtitleTrack(): Int {
        return MPVLib.getPropertyInt("sid") ?: 0
    }
    
    fun addSubtitleFile(url: String, select: Boolean = true) {
        val flag = if (select) "select" else "cached"
        MPVLib.command(arrayOf("sub-add", url, flag))
    }
    
    // MARK: - Subtitle Positioning
    
    fun setSubtitlePosition(position: Int) {
        MPVLib.setPropertyInt("sub-pos", position)
    }
    
    fun setSubtitleScale(scale: Double) {
        MPVLib.setPropertyDouble("sub-scale", scale)
    }
    
    fun setSubtitleMarginY(margin: Int) {
        MPVLib.setPropertyInt("sub-margin-y", margin)
    }
    
    fun setSubtitleAlignX(alignment: String) {
        MPVLib.setPropertyString("sub-align-x", alignment)
    }
    
    fun setSubtitleAlignY(alignment: String) {
        MPVLib.setPropertyString("sub-align-y", alignment)
    }
    
    fun setSubtitleFontSize(size: Int) {
        MPVLib.setPropertyInt("sub-font-size", size)
    }
    
    // MARK: - Audio Track Controls
    
    fun getAudioTracks(): List<Map<String, Any>> {
        val tracks = mutableListOf<Map<String, Any>>()
        
        val trackCount = MPVLib.getPropertyInt("track-list/count") ?: 0
        
        for (i in 0 until trackCount) {
            val trackType = MPVLib.getPropertyString("track-list/$i/type") ?: continue
            if (trackType != "audio") continue
            
            val trackId = MPVLib.getPropertyInt("track-list/$i/id") ?: continue
            val track = mutableMapOf<String, Any>("id" to trackId)
            
            MPVLib.getPropertyString("track-list/$i/title")?.let { track["title"] = it }
            MPVLib.getPropertyString("track-list/$i/lang")?.let { track["lang"] = it }
            MPVLib.getPropertyString("track-list/$i/codec")?.let { track["codec"] = it }
            
            val channels = MPVLib.getPropertyInt("track-list/$i/audio-channels")
            if (channels != null && channels > 0) {
                track["channels"] = channels
            }
            
            val selected = MPVLib.getPropertyBoolean("track-list/$i/selected") ?: false
            track["selected"] = selected
            
            tracks.add(track)
        }
        
        return tracks
    }
    
    fun setAudioTrack(trackId: Int) {
        Log.i(TAG, "setAudioTrack: setting aid to $trackId")
        MPVLib.setPropertyInt("aid", trackId)
    }
    
    fun getCurrentAudioTrack(): Int {
        return MPVLib.getPropertyInt("aid") ?: 0
    }

    // MARK: - Video Scaling

    fun setZoomedToFill(zoomed: Boolean) {
        // panscan: 0.0 = fit (letterbox), 1.0 = fill (crop)
        val panscanValue = if (zoomed) 1.0 else 0.0
        Log.i(TAG, "setZoomedToFill: setting panscan to $panscanValue")
        MPVLib.setPropertyDouble("panscan", panscanValue)
    }

    // MARK: - Technical Info

    fun getTechnicalInfo(): Map<String, Any> {
        val info = mutableMapOf<String, Any>()

        // Video dimensions
        MPVLib.getPropertyInt("video-params/w")?.takeIf { it > 0 }?.let {
            info["videoWidth"] = it
        }
        MPVLib.getPropertyInt("video-params/h")?.takeIf { it > 0 }?.let {
            info["videoHeight"] = it
        }

        // Video codec
        MPVLib.getPropertyString("video-format")?.let {
            info["videoCodec"] = it
        }

        // Audio codec
        MPVLib.getPropertyString("audio-codec-name")?.let {
            info["audioCodec"] = it
        }

        // FPS (container fps)
        MPVLib.getPropertyDouble("container-fps")?.takeIf { it > 0 }?.let {
            info["fps"] = it
        }

        // Video bitrate (bits per second)
        MPVLib.getPropertyInt("video-bitrate")?.takeIf { it > 0 }?.let {
            info["videoBitrate"] = it
        }

        // Audio bitrate (bits per second)
        MPVLib.getPropertyInt("audio-bitrate")?.takeIf { it > 0 }?.let {
            info["audioBitrate"] = it
        }

        // Demuxer cache duration (seconds of video buffered)
        MPVLib.getPropertyDouble("demuxer-cache-duration")?.let {
            info["cacheSeconds"] = it
        }

        // Dropped frames
        MPVLib.getPropertyInt("frame-drop-count")?.let {
            info["droppedFrames"] = it
        }

        return info
    }

    // MARK: - MPVLib.EventObserver
    
    override fun eventProperty(property: String) {
        // Property changed but no value provided
    }
    
    override fun eventProperty(property: String, value: Long) {
        when (property) {
            "track-list/count" -> {
                if (value > 0) {
                    Log.i(TAG, "Track list updated: $value tracks available")
                    mainHandler.post { delegate?.onTracksReady() }
                }
            }
            "video-params/w" -> {
                val width = value.toInt()
                if (width > 0 && width != _videoWidth) {
                    _videoWidth = width
                    notifyVideoDimensionsIfReady()
                }
            }
            "video-params/h" -> {
                val height = value.toInt()
                if (height > 0 && height != _videoHeight) {
                    _videoHeight = height
                    notifyVideoDimensionsIfReady()
                }
            }
        }
    }
    
    private fun notifyVideoDimensionsIfReady() {
        if (_videoWidth > 0 && _videoHeight > 0) {
            Log.i(TAG, "Video dimensions: ${_videoWidth}x${_videoHeight}")
            mainHandler.post { delegate?.onVideoDimensionsChanged(_videoWidth, _videoHeight) }
        }
    }
    
    override fun eventProperty(property: String, value: Boolean) {
        when (property) {
            "pause" -> {
                if (value != _isPaused) {
                    _isPaused = value
                    mainHandler.post { delegate?.onPauseChanged(value) }
                }
            }
            "paused-for-cache" -> {
                if (value != _isLoading) {
                    _isLoading = value
                    mainHandler.post { delegate?.onLoadingChanged(value) }
                }
            }
        }
    }
    
    override fun eventProperty(property: String, value: String) {
        // Handle string properties if needed
    }
    
    override fun eventProperty(property: String, value: Double) {
        when (property) {
            "duration" -> {
                cachedDuration = value
                mainHandler.post { delegate?.onPositionChanged(cachedPosition, cachedDuration, cachedCacheSeconds) }
            }
            "time-pos" -> {
                cachedPosition = value
                // Always update immediately when seeking, otherwise throttle to once per second
                val now = System.currentTimeMillis()
                val shouldUpdate = _isSeeking || (now - lastProgressUpdateTime >= 1000)
                if (shouldUpdate) {
                    lastProgressUpdateTime = now
                    mainHandler.post { delegate?.onPositionChanged(cachedPosition, cachedDuration, cachedCacheSeconds) }
                }
            }
            "demuxer-cache-duration" -> {
                cachedCacheSeconds = value
            }
        }
    }
    
    override fun event(eventId: Int) {
        when (eventId) {
            MPVLib.MPV_EVENT_FILE_LOADED -> {
                // Add external subtitles now that file is loaded
                if (pendingExternalSubtitles.isNotEmpty()) {
                    pendingExternalSubtitles.forEachIndexed { index, subUrl ->
                        android.util.Log.d("MPVRenderer", "Adding external subtitle [$index]: $subUrl")
                        // "auto" flag = add without auto-selecting (order preserved, MPVLib.command is sync)
                        MPVLib.command(arrayOf("sub-add", subUrl, "auto"))
                    }
                    pendingExternalSubtitles = emptyList()
                    
                    // Set subtitle after external subs are added
                    initialSubtitleId?.let { setSubtitleTrack(it) } ?: disableSubtitles()
                }
                
                if (!isReadyToSeek) {
                    isReadyToSeek = true
                    mainHandler.post { delegate?.onReadyToSeek() }
                }
                
                if (_isLoading) {
                    _isLoading = false
                    mainHandler.post { delegate?.onLoadingChanged(false) }
                }
            }
            MPVLib.MPV_EVENT_SEEK -> {
                // Seek started - show loading indicator and enable immediate progress updates
                _isSeeking = true
                if (!_isLoading) {
                    _isLoading = true
                    mainHandler.post { delegate?.onLoadingChanged(true) }
                }
            }
            MPVLib.MPV_EVENT_PLAYBACK_RESTART -> {
                // Video playback has started/restarted (including after seek)
                _isSeeking = false
                if (_isLoading) {
                    _isLoading = false
                    mainHandler.post { delegate?.onLoadingChanged(false) }
                }
            }
            MPVLib.MPV_EVENT_END_FILE -> {
                Log.i(TAG, "Playback ended")
            }
            MPVLib.MPV_EVENT_SHUTDOWN -> {
                Log.w(TAG, "MPV shutdown")
            }
        }
    }
}

