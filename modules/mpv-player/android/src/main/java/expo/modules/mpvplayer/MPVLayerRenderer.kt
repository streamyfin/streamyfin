package expo.modules.mpvplayer

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.system.Os
import android.util.Log
import android.view.Surface
import java.io.File
import java.util.Locale

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

    private fun isTvDevice(): Boolean {
        val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        return uiModeManager.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
    }

    /**
     * True only on the Android emulator. Its goldfish/ranchu MediaCodec can't bind a
     * decode output surface (decode opens with surface 0x0): HEVC then fails cleanly and
     * mpv auto-falls-back to software, but H.264 "opens" deceptively and wedges the core
     * (no fallback) — black video, then any command (seek/pause) deadlocks the UI thread
     * → ANR. We force software decoding here.
     *
     * Only QEMU/SDK-exclusive signals are checked so a real device can never match — a
     * false positive would needlessly drop shipping hardware to software decoding. The
     * emulator reports ro.hardware=goldfish|ranchu, an sdk_* product, or a generic/
     * emulator build fingerprint, none of which appear on real devices.
     */
    private fun isEmulator(): Boolean {
        val hardware = Build.HARDWARE.lowercase()
        if (hardware == "goldfish" || hardware == "ranchu") return true

        val product = Build.PRODUCT
        if (product == "sdk" || product.startsWith("sdk_")) return true

        val fingerprint = Build.FINGERPRINT
        return fingerprint.startsWith("generic") ||
            fingerprint.contains("emulator", ignoreCase = true)
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

    // This renderer's own mpv handle. Per-instance (not singleton) — each
    // player screen gets a fresh mpv handle and drops the reference on stop.
    // We intentionally do NOT call a destroy() equivalent: libmpv 1.0's
    // nativeDestroy has an internal use-after-free we can't fix from Kotlin,
    // so we mirror Findroid and let the JVM GC + native finalization path
    // reclaim resources. Only one player is alive at a time in this app.
    private var mpv: MPVLib? = null

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
    // Persistent record of the external subtitle URLs attached to the
    // current item. pendingExternalSubtitles above is a one-shot staging
    // list: load() fills it and the FILE_LOADED handler drains it via
    // sub-add, so it is always empty by the time a resume-recovery reload
    // runs. This copy survives that drain so recoverVideoOutput() can hand
    // the same sidecar URLs back to load() and the tracks re-attach after
    // the decoder reset.
    private var activeExternalSubtitles: List<String> = emptyList()
    private var initialSubtitleId: Int? = null
    private var initialAudioId: Int? = null
    
    val isPausedState: Boolean
        get() = _isPaused
    
    val currentPosition: Double
        get() = cachedPosition
    
    val duration: Double
        get() = cachedDuration
    
    /**
     * The VO driver to use. Stored so attachSurface can re-enable the same driver.
     */
    private var voDriver: String = "gpu-next"

    /**
     * True on Android TV form-factor devices. Drives both the hwdec selection
     * in [start] and the TV-only resume-recovery gating in [MpvPlayerView].
     * Computed once from the system UI mode.
     */
    val isTv: Boolean = isTvDevice()

    fun start(voDriver: String = "gpu-next") {
        if (isRunning) return

        try {
            // Per-instance handle — see class-level comment. Each player gets
            // its own mpv; we drop the reference in stop().
            val mpv = MPVLib.create(context)
            this.mpv = mpv
            mpv.addObserver(this)

            // mpv config directory — used by the config-dir option below and
            // as XDG_CONFIG_HOME for fontconfig.
            val mpvDir = File(context.getExternalFilesDir(null) ?: context.filesDir, "mpv")
            if (!mpvDir.exists()) mpvDir.mkdirs()

            // Point fontconfig (new in libmpv 1.0) at writable app dirs so it
            // persists its font index across runs instead of re-walking
            // /system/fonts on every subtitle/seek event. Each rebuild costs
            // ~1-2 s and ~10-30 MB of scudo:primary memory that scudo then
            // holds onto. Without this we see "No usable fontconfig
            // configuration file found, using fallback" on every re-init.
            try {
                val cacheDir = context.cacheDir.absolutePath
                val configDir = (context.getExternalFilesDir(null) ?: context.filesDir).absolutePath
                Os.setenv("XDG_CACHE_HOME", cacheDir, true)
                Os.setenv("XDG_CONFIG_HOME", configDir, true)
                Os.setenv("HOME", configDir, true)
            } catch (e: Exception) {
                Log.w(TAG, "Could not set XDG/HOME env for fontconfig: ${e.message}")
            }

            mpv?.setOptionString("config", "yes")
            mpv?.setOptionString("config-dir", mpvDir.path)
            
            // Configure mpv options before initialization (based on Findroid)
            this.voDriver = voDriver
            mpv?.setOptionString("vo", voDriver)
            mpv?.setOptionString("gpu-context", "android")
            mpv?.setOptionString("opengl-es", "yes")
            
            // Hardware decoder codecs (shared)
            mpv?.setOptionString("hwdec-codecs", "h264,hevc,mpeg4,mpeg2video,vp8,vp9,av1")

            // Pause on initial cache fill (shared default). The actual
            // cache mode, cache-secs, and demuxer cache sizes come from
            // user preferences and are applied per-load in load().
            mpv?.setOptionString("cache-pause-initial", "yes")

            // Hardware decode path + TV-only memory options. Demuxer cache
            // sizes and cache-secs are NOT set here — they come from user
            // preferences via load().
            //  - Emulator: software decode. Its MediaCodec can't bind an
            //    output surface (surface 0x0); HEVC then fails cleanly and
            //    mpv auto-falls-back to software, but H.264 "opens"
            //    deceptively and wedges the core with no fallback (black
            //    video, then any command — seek/pause — deadlocks the UI
            //    thread → ANR). hwdec=no makes every codec render via the
            //    gpu-next VO. Real devices unaffected.
            //  - Real TV hardware: zero-copy `mediacodec` (fastest on
            //    low-power devices) + fast profile.
            //  - Real phone: `mediacodec-copy` (broadest compatibility).
            when {
                isEmulator() -> mpv?.setOptionString("hwdec", "no")
                isTv -> {
                    mpv?.setOptionString("hwdec", "mediacodec")
                    mpv?.setOptionString("profile", "fast")
                    // Don't retain already-played content for backward
                    // seeking over a network source — Jellyfin can re-fetch
                    // on demand. Saves up to ~30 MiB on long seeks and
                    // reduces swap pressure.
                    mpv?.setOptionString("demuxer-seekable-cache", "no")
                    // Larger audio buffer to absorb page-fault stalls
                    // (default ~0.2s). Cheap insurance against the audio
                    // underruns that happen when the kernel is swap-thrashing.
                    mpv?.setOptionString("audio-buffer", "0.5")
                }
                else -> mpv?.setOptionString("hwdec", "mediacodec-copy")
            }
            
            // Seeking optimization - faster seeking at the cost of less precision
            // Use keyframe seeking by default (much faster for network streams)
            mpv?.setOptionString("hr-seek", "no")
            // Drop frames during seeking for faster response
            mpv?.setOptionString("hr-seek-framedrop", "yes")
            
            // Subtitle settings
            mpv?.setOptionString("sub-scale-with-window", "no")
            mpv?.setOptionString("sub-use-margins", "no")
            mpv?.setOptionString("subs-match-os-language", "yes")
            mpv?.setOptionString("subs-fallback", "yes")
            
            // Important: Start with force-window=no, will be set to yes when surface is attached
            mpv?.setOptionString("force-window", "no")
            mpv?.setOptionString("keep-open", "always")

            mpv.initialize()

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
        if (!isRunning) return
        isRunning = false

        val m = mpv
        mpv = null

        // Clear cached media state on the main thread so the next player
        // screen doesn't observe stale position/duration values during the
        // (async) teardown below.
        currentUrl = null
        currentHeaders = null
        pendingExternalSubtitles = emptyList()
        activeExternalSubtitles = emptyList()
        initialSubtitleId = null
        initialAudioId = null
        cachedPosition = 0.0
        cachedDuration = 0.0
        cachedCacheSeconds = 0.0

        if (m == null) return

        // Teardown runs on a background daemon thread. mpv's "stop" command
        // flushes the demuxer queue and releases the MediaCodec hardware
        // decoder — synchronous JNI work that can block for hundreds of ms
        // on TV hardware. Running it on the main thread produced a visible
        // delay/stutter between pressing "exit" and the confirm alert
        // appearing. The local `m` keeps the MPVLib instance alive for the
        // lifetime of this thread even though we've already nulled `mpv`.
        Thread {
            // Drop force-window BEFORE issuing stop. With keep-open=always +
            // force-window=yes, mpv tears down the decoder at stop time but
            // tries to keep the VO alive — which fires an internal
            // video-reconfig. On libmpv 1.0's gpu-next/android backend that
            // reconfig path crashes with "Missing surface pointer" because we
            // detach the Surface below before mpv's worker reaches the
            // reconfig step (command() is async). Setting force-window=no
            // first makes mpv tear VO down cleanly instead of attempting a
            // doomed re-init, eliminating the fatal VO error and the
            // "playback won't restart" aftermath.
            try {
                m.setOptionString("force-window", "no")
            } catch (e: Exception) {
                Log.e(TAG, "Error clearing force-window: ${e.message}")
            }
            try {
                // Stop playback — flushes demuxer queue and signals MediaCodec
                // to release its hardware decoders. This is the bulk of what
                // we can reclaim without calling destroy().
                m.command(arrayOf("stop"))
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping mpv playback: ${e.message}")
            }
            try {
                m.removeObserver(this)
            } catch (e: Exception) {
                Log.e(TAG, "Error removing mpv observer: ${e.message}")
            }
            try {
                m.detachSurface()
            } catch (e: Exception) {
                Log.e(TAG, "Error detaching mpv surface: ${e.message}")
            }
        }.also { it.isDaemon = true }.start()
    }
    
    /**
     * Attach surface and ensure video output is active.
     *
     * During PiP transitions, the surface is destroyed and recreated by Android.
     * We keep the VO pipeline alive (not killed with vo=null) so that rendering
     * resumes immediately when the new surface is attached — avoiding the black
     * screen that occurs when the VO is fully re-initialized via setOptionString.
     */
    fun attachSurface(surface: Surface) {
        this.surface = surface
        Log.i(TAG, "[PiP] attachSurface — isRunning=$isRunning, vo=$voDriver, surface=${surface.hashCode()}")
        if (isRunning) {
            mpv?.attachSurface(surface)
            mpv?.setOptionString("force-window", "yes")
            // Read back vo to confirm it's still active
            val activeVo = try { mpv?.getPropertyString("vo") } catch (e: Exception) { null }
            Log.i(TAG, "[PiP] attachSurface — attached, activeVo=$activeVo")
        }
    }

    /**
     * Detach surface without killing the VO pipeline.
     *
     * The previous approach (vo=null / force-window=no) destroyed the entire video
     * output pipeline on every surface transition. During PiP mode, the rapid
     * destroy/recreate cycle caused a black screen because setOptionString("vo", ...)
     * did not properly re-initialize rendering into the new PiP surface.
     *
     * By keeping the VO alive, frames are simply dropped while no surface is
     * attached, and rendering resumes immediately when the new surface arrives.
     */
    fun detachSurface() {
        this.surface = null
        Log.i(TAG, "[PiP] detachSurface — isRunning=$isRunning, vo=$voDriver")
        if (isRunning) {
            mpv?.detachSurface()
            val activeVo = try { mpv?.getPropertyString("vo") } catch (e: Exception) { null }
            Log.i(TAG, "[PiP] detachSurface — detached, activeVo=$activeVo (should still be $voDriver)")
        }
    }
    
    /**
     * Updates the surface size. Called from surfaceChanged.
     * Based on Findroid's implementation.
     */
    fun updateSurfaceSize(width: Int, height: Int) {
        if (isRunning) {
            mpv?.setPropertyString("android-surface-size", "${width}x$height")
            Log.i(TAG, "[PiP] updateSurfaceSize — ${width}x${height}")
        } else {
            Log.w(TAG, "[PiP] updateSurfaceSize — called but renderer not running")
        }
    }

    /**
     * Restore video after a system-initiated surface loss (Android TV
     * screensaver / app background while paused). Triggered from the host
     * activity's onResume via [MpvPlayerView.runResumeRecovery].
     *
     * On TV, `hwdec=mediacodec` (zero-copy) binds MediaCodec directly to the
     * display surface. When the screensaver invalidates that surface, the
     * decoder is left bound to dead buffers and mpv auto-disables the video
     * track (vid=no). Re-attaching the surface + cycling hwdec + re-selecting
     * vid + seeking rebuilds the pipeline but leaves the video chain at EOF
     * ("video=eof" in playback-restart) — the recreated MediaCodec produces no
     * frames. Only a fresh `loadfile` deterministically recreates the decoder
     * against the live surface, so we reload at the cached position.
     *
     * This is the Android counterpart to iOS's `performDecoderReset()`, which
     * can get away with a `hwdec` cycle because VideoToolbox reinitializes
     * cleanly; zero-copy MediaCodec bound to a lost surface does not.
     */
    fun recoverVideoOutput(surface: Surface?) {
        if (!isRunning) {
            Log.w(TAG, "[Recover] recoverVideoOutput — renderer not running, skipping")
            return
        }
        val url = currentUrl ?: run {
            Log.w(TAG, "[Recover] recoverVideoOutput — no URL loaded, skipping")
            return
        }

        Log.i(
            TAG,
            "[Recover] reload recovery — pos=$cachedPosition, aid=${getCurrentAudioTrack()}, sid=${getCurrentSubtitleTrack()}"
        )

        // Re-attach the surface first (covers the case where the surface
        // survived and surfaceCreated never fired). The reload below fully
        // rebuilds the pipeline anyway, but this keeps the VO target current
        // while the load is in flight.
        surface?.takeIf { it.isValid }?.let { mpv?.attachSurface(it) }

        // Preserve the user's current audio/subtitle selection across the
        // reload — pass them INTO load() (not via the field: load() overwrites
        // the initial IDs from its parameters). They're re-applied when
        // FILE_LOADED fires. (0 / "no" means "off", which setSubtitleTrack /
        // setAudioTrack handle correctly.)
        val savedAid = getCurrentAudioTrack()
        val savedSid = getCurrentSubtitleTrack()

        // Full reload at the paused position. With keep-open=always +
        // cache-pause-initial=yes, mpv seeks to the position and holds on the
        // first decoded frame, so the paused frame reappears.
        load(
            url = url,
            headers = currentHeaders,
            startPosition = cachedPosition,
            initialAudioId = savedAid,
            initialSubtitleId = savedSid,
            externalSubtitles = activeExternalSubtitles
        )

        // Hold the paused state explicitly — we only get here while paused,
        // and load() doesn't touch the pause property.
        pause()
    }
    
    fun load(
        url: String,
        headers: Map<String, String>? = null,
        startPosition: Double? = null,
        externalSubtitles: List<String>? = null,
        initialSubtitleId: Int? = null,
        initialAudioId: Int? = null,
        cacheEnabled: String? = null,
        cacheSeconds: Int? = null,
        demuxerMaxBytes: Int? = null,
        demuxerMaxBackBytes: Int? = null
    ) {
        currentUrl = url
        currentHeaders = headers
        pendingExternalSubtitles = externalSubtitles ?: emptyList()
        activeExternalSubtitles = pendingExternalSubtitles
        this.initialSubtitleId = initialSubtitleId
        this.initialAudioId = initialAudioId

        _isLoading = true
        isReadyToSeek = false
        mainHandler.post { delegate?.onLoadingChanged(true) }

        // Stop previous playback
        mpv?.command(arrayOf("stop"))

        // Set HTTP headers if provided
        updateHttpHeaders(headers)

        // Apply cache/buffer settings from user preferences (mirrors iOS).
        // These override the conservative defaults applied in start() so the
        // TV/mobile settings screen actually takes effect on Android.
        cacheEnabled?.let { mpv?.setOptionString("cache", it) }
        cacheSeconds?.let { mpv?.setOptionString("cache-secs", it.toString()) }
        demuxerMaxBytes?.let { mpv?.setOptionString("demuxer-max-bytes", "${it}MiB") }
        demuxerMaxBackBytes?.let { mpv?.setOptionString("demuxer-max-back-bytes", "${it}MiB") }
        
        // Set start position. mpv's time parser requires '.' as the decimal
        // separator; use Locale.US so devices with other default locales
        // (e.g. ',' as decimal separator) don't break resume-from-position.
        if (startPosition != null && startPosition > 0) {
            mpv?.setPropertyString("start", String.format(Locale.US, "%.2f", startPosition))
        } else {
            mpv?.setPropertyString("start", "0")
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
        mpv?.command(arrayOf("loadfile", url, "replace"))
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
        mpv?.setPropertyString("http-header-fields", headerString)
    }
    
    private fun observeProperties() {
        mpv?.observeProperty("duration", MPV_FORMAT_DOUBLE)
        mpv?.observeProperty("time-pos", MPV_FORMAT_DOUBLE)
        mpv?.observeProperty("pause", MPV_FORMAT_FLAG)
        mpv?.observeProperty("track-list/count", MPV_FORMAT_INT64)
        mpv?.observeProperty("paused-for-cache", MPV_FORMAT_FLAG)
        mpv?.observeProperty("demuxer-cache-duration", MPV_FORMAT_DOUBLE)
        // Video dimensions for PiP aspect ratio
        mpv?.observeProperty("video-params/w", MPV_FORMAT_INT64)
        mpv?.observeProperty("video-params/h", MPV_FORMAT_INT64)
    }

    // MARK: - Playback Controls
    
    fun play() {
        mpv?.setPropertyBoolean("pause", false)
    }
    
    fun pause() {
        mpv?.setPropertyBoolean("pause", true)
    }
    
    fun togglePause() {
        if (_isPaused) play() else pause()
    }
    
    fun seekTo(seconds: Double) {
        val clamped = maxOf(0.0, seconds)
        cachedPosition = clamped
        mpv?.command(arrayOf("seek", clamped.toString(), "absolute"))
    }
    
    fun seekBy(seconds: Double) {
        val newPosition = maxOf(0.0, cachedPosition + seconds)
        cachedPosition = newPosition
        mpv?.command(arrayOf("seek", seconds.toString(), "relative"))
    }
    
    fun setSpeed(speed: Double) {
        _playbackSpeed = speed
        mpv?.setPropertyDouble("speed", speed)
    }

    /** Mute the player itself; the device output volume is left untouched. */
    fun setMute(muted: Boolean) {
        mpv?.setPropertyBoolean("mute", muted)
    }
    
    fun getSpeed(): Double {
        return mpv?.getPropertyDouble("speed") ?: _playbackSpeed
    }
    
    // MARK: - Subtitle Controls
    
    fun getSubtitleTracks(): List<Map<String, Any>> {
        val tracks = mutableListOf<Map<String, Any>>()
        
        val trackCount = mpv?.getPropertyInt("track-list/count") ?: 0
        
        for (i in 0 until trackCount) {
            val trackType = mpv?.getPropertyString("track-list/$i/type") ?: continue
            if (trackType != "sub") continue
            
            val trackId = mpv?.getPropertyInt("track-list/$i/id") ?: continue
            val track = mutableMapOf<String, Any>("id" to trackId)

            mpv?.getPropertyString("track-list/$i/title")?.let { track["title"] = it }
            mpv?.getPropertyString("track-list/$i/lang")?.let { track["lang"] = it }
            mpv?.getPropertyString("track-list/$i/codec")?.let { track["codec"] = it }

            // Identity fields used to map a Jellyfin subtitle to the real track
            // (instead of fragile positional counting). `external` + `external-filename`
            // uniquely identify a sub-added sidecar. `ff-index` is exposed for
            // diagnostics / potential future exact-index matching; the current
            // resolver matches embedded tracks by language/title, not ff-index.
            val external = mpv?.getPropertyBoolean("track-list/$i/external") ?: false
            track["external"] = external
            mpv?.getPropertyString("track-list/$i/external-filename")?.let {
                track["externalFilename"] = it
            }
            mpv?.getPropertyInt("track-list/$i/ff-index")?.let { track["ffIndex"] = it }

            val selected = mpv?.getPropertyBoolean("track-list/$i/selected") ?: false
            track["selected"] = selected

            tracks.add(track)
        }

        return tracks
    }
    
    fun setSubtitleTrack(trackId: Int) {
        Log.i(TAG, "setSubtitleTrack: setting sid to $trackId")
        if (trackId < 0) {
            mpv?.setPropertyString("sid", "no")
        } else {
            mpv?.setPropertyInt("sid", trackId)
        }
    }
    
    fun disableSubtitles() {
        mpv?.setPropertyString("sid", "no")
    }
    
    fun getCurrentSubtitleTrack(): Int {
        return mpv?.getPropertyInt("sid") ?: 0
    }
    
    fun addSubtitleFile(url: String, select: Boolean = true) {
        val flag = if (select) "select" else "cached"
        mpv?.command(arrayOf("sub-add", url, flag))
        // Track runtime side-loads too, so they survive a resume-recovery
        // reload just like external subs passed to load().
        if (url.isNotEmpty() && url !in activeExternalSubtitles) {
            activeExternalSubtitles = activeExternalSubtitles + url
        }
    }
    
    // MARK: - Subtitle Positioning
    
    fun setSubtitlePosition(position: Int) {
        mpv?.setPropertyInt("sub-pos", position)
    }
    
    fun setSubtitleScale(scale: Double) {
        mpv?.setPropertyDouble("sub-scale", scale)
    }
    
    fun setSubtitleMarginY(margin: Int) {
        mpv?.setPropertyInt("sub-margin-y", margin)
    }
    
    fun setSubtitleAlignX(alignment: String) {
        mpv?.setPropertyString("sub-align-x", alignment)
    }
    
    fun setSubtitleAlignY(alignment: String) {
        mpv?.setPropertyString("sub-align-y", alignment)
    }
    
    fun setSubtitleFontSize(size: Int) {
        mpv?.setPropertyInt("sub-font-size", size)
    }

    fun setSubtitleBorderStyle(style: String) {
        mpv?.setPropertyString("sub-border-style", style)
    }

    fun setSubtitleBackgroundColor(color: String) {
        mpv?.setPropertyString("sub-back-color", color)
    }

    fun setSubtitleAssOverride(mode: String) {
        mpv?.setPropertyString("sub-ass-override", mode)
    }

    // MARK: - Audio Track Controls
    
    fun getAudioTracks(): List<Map<String, Any>> {
        val tracks = mutableListOf<Map<String, Any>>()
        
        val trackCount = mpv?.getPropertyInt("track-list/count") ?: 0
        
        for (i in 0 until trackCount) {
            val trackType = mpv?.getPropertyString("track-list/$i/type") ?: continue
            if (trackType != "audio") continue
            
            val trackId = mpv?.getPropertyInt("track-list/$i/id") ?: continue
            val track = mutableMapOf<String, Any>("id" to trackId)
            
            mpv?.getPropertyString("track-list/$i/title")?.let { track["title"] = it }
            mpv?.getPropertyString("track-list/$i/lang")?.let { track["lang"] = it }
            mpv?.getPropertyString("track-list/$i/codec")?.let { track["codec"] = it }
            
            val channels = mpv?.getPropertyInt("track-list/$i/audio-channels")
            if (channels != null && channels > 0) {
                track["channels"] = channels
            }
            
            val selected = mpv?.getPropertyBoolean("track-list/$i/selected") ?: false
            track["selected"] = selected
            
            tracks.add(track)
        }
        
        return tracks
    }
    
    fun setAudioTrack(trackId: Int) {
        Log.i(TAG, "setAudioTrack: setting aid to $trackId")
        mpv?.setPropertyInt("aid", trackId)
    }
    
    fun getCurrentAudioTrack(): Int {
        return mpv?.getPropertyInt("aid") ?: 0
    }

    // MARK: - Video Scaling

    fun setZoomedToFill(zoomed: Boolean) {
        // panscan: 0.0 = fit (letterbox), 1.0 = fill (crop)
        val panscanValue = if (zoomed) 1.0 else 0.0
        Log.i(TAG, "setZoomedToFill: setting panscan to $panscanValue")
        mpv?.setPropertyDouble("panscan", panscanValue)
    }

    // MARK: - Technical Info

    fun getTechnicalInfo(): Map<String, Any> {
        val info = mutableMapOf<String, Any>()

        // Video dimensions
        mpv?.getPropertyInt("video-params/w")?.takeIf { it > 0 }?.let {
            info["videoWidth"] = it
        }
        mpv?.getPropertyInt("video-params/h")?.takeIf { it > 0 }?.let {
            info["videoHeight"] = it
        }

        // Video codec
        mpv?.getPropertyString("video-format")?.let {
            info["videoCodec"] = it
        }

        // Audio codec
        mpv?.getPropertyString("audio-codec-name")?.let {
            info["audioCodec"] = it
        }

        // FPS (container fps)
        mpv?.getPropertyDouble("container-fps")?.takeIf { it > 0 }?.let {
            info["fps"] = it
        }

        // Video bitrate (bits per second)
        mpv?.getPropertyInt("video-bitrate")?.takeIf { it > 0 }?.let {
            info["videoBitrate"] = it
        }

        // Audio bitrate (bits per second)
        mpv?.getPropertyInt("audio-bitrate")?.takeIf { it > 0 }?.let {
            info["audioBitrate"] = it
        }

        // Demuxer cache duration (seconds of video buffered)
        mpv?.getPropertyDouble("demuxer-cache-duration")?.let {
            info["cacheSeconds"] = it
        }

        // Configured cache limits — read back from mpv to confirm user
        // settings actually took effect. mpv stores byte sizes as int64
        // (bytes); convert to MiB for display.
        mpv?.getPropertyInt("demuxer-max-bytes")?.let { bytes ->
            info["demuxerMaxBytes"] = bytes / (1024 * 1024)
        }
        mpv?.getPropertyInt("demuxer-max-back-bytes")?.let { bytes ->
            info["demuxerMaxBackBytes"] = bytes / (1024 * 1024)
        }
        mpv?.getPropertyDouble("cache-secs")?.let { secs ->
            info["cacheSecsLimit"] = secs
        }

        // Dropped frames
        mpv?.getPropertyInt("frame-drop-count")?.let {
            info["droppedFrames"] = it
        }

        // Active video output driver (read from MPV to confirm what's actually applied)
        mpv?.getPropertyString("vo")?.let {
            info["voDriver"] = it
        }

        // Active hardware decoder.
        // hwdec-current yields e.g. "mediacodec",
        // "mediacodec-copy", "auto-copy" or empty when SW decoding.
        mpv?.getPropertyString("hwdec-current")?.let {
            info["hwdec"] = it
        }

        // Estimated video output fps (renderer-side, after filtering).
        // Useful for diagnosing display/pipeline drops vs container fps.
        mpv?.getPropertyDouble("estimated-vf-fps")?.takeIf { it > 0 }?.let {
            info["estimatedVfFps"] = it
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
                        mpv?.command(arrayOf("sub-add", subUrl, "auto"))
                    }
                    pendingExternalSubtitles = emptyList()
                }

                // Apply the initial audio/subtitle selection now that the file's
                // tracks are enumerated. Setting sid/aid before `loadfile` does not
                // reliably stick for embedded tracks (the selection is silently
                // dropped), so we (re)apply here for embedded and external alike.
                // This is what makes a carried-over subtitle show up on the next
                // episode without a manual re-selection.
                initialAudioId?.let { if (it > 0) setAudioTrack(it) }
                initialSubtitleId?.let { setSubtitleTrack(it) } ?: disableSubtitles()

                // The disable above can race a JS-side identity selection that
                // landed before FILE_LOADED (JS no longer passes an initial sid).
                // Re-emit tracksReady so the idempotent JS re-apply always runs
                // after it — for embedded-only files this is the only
                // post-FILE_LOADED fire.
                mainHandler.post { delegate?.onTracksReady() }

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

