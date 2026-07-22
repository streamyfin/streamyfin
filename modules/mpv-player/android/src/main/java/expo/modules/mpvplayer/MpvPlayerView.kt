package expo.modules.mpvplayer

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
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
    val voDriver: String? = null,
    val cacheEnabled: String? = null,
    val cacheSeconds: Int? = null,
    val demuxerMaxBytes: Int? = null,
    val demuxerMaxBackBytes: Int? = null,
)

/**
 * MpvPlayerView - ExpoView that hosts the MPV player.
 *
 * Uses SurfaceView (not TextureView) so the surface routes directly to
 * SurfaceFlinger (the OS compositor) rather than compositing into the
 * app's window surface. This matches mpv-android's architecture and
 * gives mpv a standalone surface.
 *
 * PiP black-screen mitigation: SurfaceView's surface is destroyed and
 * recreated on PiP entry/exit, and the new surface's initial dimensions
 * can be stale until the next layout pass. We push dimension updates to
 * mpv via both SurfaceHolder.Callback.surfaceChanged AND an
 * OnLayoutChangeListener, so the PiP transition (which fires layout
 * passes on the view itself) reaches mpv promptly.
 */
class MpvPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
    MPVLayerRenderer.Delegate, SurfaceHolder.Callback {

    companion object {
        private const val TAG = "MpvPlayerView"

        // Grace window after onActivityResumed before running the resume
        // recovery, so surfaceCreated (surface-destroyed case) has fired and
        // the holder has a valid surface. If the surface survived the
        // screensaver and surfaceCreated never fires, this still runs.
        private const val RESUME_RECOVERY_DELAY_MS = 300L
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

    private var surfaceView: SurfaceView
    private var renderer: MPVLayerRenderer? = null
    private var pipController: PiPController? = null

    private var currentUrl: String? = null
    private var cachedPosition: Double = 0.0
    private var cachedDuration: Double = 0.0
    private var intendedPlayState: Boolean = false
    private var surfaceReady: Boolean = false
    private var pendingConfig: VideoLoadConfig? = null
    private var rendererStarted: Boolean = false
    private var activeSurface: Surface? = null

    // PiP state tracking
    private val pipHandler = Handler(Looper.getMainLooper())

    // Resume-recovery state: recreate the decoder when returning from the
    // screensaver / app background while paused. See
    // MPVLayerRenderer.recoverVideoOutput for why zero-copy hwdec=mediacodec
    // needs this.
    private var hostActivity: Activity? = null
    private var lifecycleCallbacks: Application.ActivityLifecycleCallbacks? = null
    private var lifecycleRegistered = false
    private val recoverResumeRunnable = Runnable { runResumeRecovery() }

    init {
        setBackgroundColor(Color.BLACK)

        // SurfaceView for video rendering. Routes the surface directly to
        // SurfaceFlinger (the OS compositor), giving mpv a standalone
        // surface. TextureView composites into the app's window surface
        // which is less efficient and breaks PiP transitions.
        surfaceView = SurfaceView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        surfaceView.holder.addCallback(this@MpvPlayerView)
        addView(surfaceView)

        // Push dimension updates to mpv on every view bounds change. This
        // is the primary PiP black-screen fix: entering PiP fires a layout
        // pass on the SurfaceView itself, and we proactively tell mpv the
        // new size so it resizes its EGL swapchain before rendering.
        surfaceView.addOnLayoutChangeListener { _, left, top, right, bottom,
                                                  oldLeft, oldTop, oldRight, oldBottom ->
            val w = right - left
            val h = bottom - top
            val oldW = oldRight - oldLeft
            val oldH = oldBottom - oldTop
            if (w > 0 && h > 0 && (w != oldW || h != oldH)) {
                renderer?.updateSurfaceSize(w, h)
            }
        }

        // Initialize PiP controller with Expo's AppContext for proper activity access
        pipController = PiPController(context, appContext)
        pipController?.setPlayerView(surfaceView)
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
                    // Post size syncs after the PiP layout settles. Two passes
                    // catch both the immediate surface re-attach and the
                    // post-animation layout pass. Replaces the old TextureView
                    // measure/layout polling hack (forcePiPBufferSize).
                    pipHandler.removeCallbacksAndMessages(null)
                    pipHandler.postDelayed({ syncSurfaceSizeToView() }, 100)
                    pipHandler.postDelayed({ syncSurfaceSizeToView() }, 500)
                } else {
                    // Restore from PiP: surface resized back to fullscreen.
                    pipHandler.removeCallbacksAndMessages(null)
                    pipHandler.postDelayed({ syncSurfaceSizeToView() }, 100)
                }
                onPictureInPictureChange(mapOf("isActive" to isInPiP))
            }
        }

        // Renderer is created lazily in loadVideo once we have the voDriver setting
        renderer = MPVLayerRenderer(context)
        renderer?.delegate = this

        // Watch the host activity's lifecycle to recover the video pipeline
        // when returning from the screensaver while paused.
        registerLifecycleCallbacks()
    }

    /**
     * Start the renderer with the given VO driver.
     * Called lazily on first loadVideo so user settings are available.
     */
    private fun ensureRendererStarted(voDriver: String?) {
        if (rendererStarted) return

        try {
            renderer?.start(voDriver ?: "gpu-next")
            rendererStarted = true

            // If the surface is already alive (surfaceCreated fired before
            // loadVideo), attach it now. With SurfaceView the surface is
            // owned by the holder, so we read it from there directly rather
            // than stashing it on the side.
            surfaceView.holder.surface?.takeIf { it.isValid }?.let { surface ->
                activeSurface = surface
                renderer?.attachSurface(surface)
                syncSurfaceSizeToView()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start renderer: ${e.message}")
            onError(mapOf("error" to "Failed to start renderer: ${e.message}"))
        }
    }

    // MARK: - SurfaceHolder.Callback

    override fun surfaceCreated(holder: SurfaceHolder) {
        val surface = holder.surface
        surfaceReady = true

        if (rendererStarted) {
            // The previous Surface reference is holder-owned; do NOT release
            // it (SurfaceView manages its lifecycle). Just track the new one.
            activeSurface = surface
            renderer?.attachSurface(surface)
            // Push the actual view dimensions immediately so mpv doesn't
            // render against stale full-screen geometry during PiP transitions.
            syncSurfaceSizeToView()
        }

        // If we have a pending load, execute it now
        pendingConfig?.let { config ->
            ensureRendererStarted(config.voDriver)
            loadVideoInternal(config)
            pendingConfig = null
        }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        if (width > 0 && height > 0) {
            renderer?.updateSurfaceSize(width, height)
        }
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        surfaceReady = false
        renderer?.detachSurface()
        // Do NOT issue mpv "stop" here. Playback continues against the
        // demuxer; when surfaceCreated fires again (PiP entry/exit, app
        // background/foreground), we re-attach and frames resume. This
        // matches the keep-open=always setting in MPVLayerRenderer.
        //
        // Do NOT release activeSurface — SurfaceView owns it via the holder.
        activeSurface = null
    }

    /**
     * Read the actual SurfaceView width/height and push them to mpv.
     * The PiP transition can fire surfaceCreated before the view's layout
     * has settled to PiP dimensions, so we re-sync after layout passes.
     */
    private fun syncSurfaceSizeToView() {
        if (!surfaceReady) return
        val w = surfaceView.width
        val h = surfaceView.height
        if (w > 0 && h > 0) {
            renderer?.updateSurfaceSize(w, h)
        }
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
            initialAudioId = config.initialAudioId,
            cacheEnabled = config.cacheEnabled,
            cacheSeconds = config.cacheSeconds,
            demuxerMaxBytes = config.demuxerMaxBytes,
            demuxerMaxBackBytes = config.demuxerMaxBackBytes
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

    /**
     * Stop playback and release decoder resources.
     *
     * Delegates to [MPVLayerRenderer.stop], which issues mpv's "stop" command
     * on a background thread (flushing the demuxer and releasing the
     * MediaCodec hardware decoder) and drops the per-instance mpv handle.
     *
     * NOTE: this does NOT call `LibMPV.destroy()`. libmpv 1.0's
     * nativeDestroy has an internal use-after-free on the JNI global ref
     * path, so the native mpv handle is intentionally left for the JVM GC
     * / native finalizer rather than torn down synchronously. See
     * [MPVLib] class doc for the full rationale.
     *
     * Call this BEFORE navigating away from the player screen so the
     * decoder is reclaimed before the next screen (or the next episode's
     * player) mounts. Otherwise Expo Router renders the new screen first
     * and you briefly have two mpv instances + two 4K decoders alive —
     * instant OOM on a 2 GB device.
     */
    fun destroy() {
        renderer?.stop()

        // Reset view-level state so a subsequent loadVideo() on the SAME view
        // instance re-creates the mpv handle and re-attaches the still-live
        // SurfaceView surface. Without this, rendererStarted stays true and
        // ensureRendererStarted() early-returns, so renderer.start() is never
        // called again — but stop() already nulled the renderer's mpv handle.
        // The next loadVideo() then runs loadVideoInternal() -> renderer.load()
        // against mpv == null, where every mpv?.command() (including the
        // "stop" and load commands) silently no-ops, leaving a black frame.
        //
        // This path is hit by direct-player.tsx's goToNextItem()/stop(),
        // which call destroy() immediately before router.replace() to the
        // same route — Expo Router reuses the same MpvPlayerView instance,
        // so the next source load happens on this view without a remount.
        //
        // SurfaceView note: the surface is owned by the holder and survives
        // across destroy()/loadVideo() on the same view instance. The next
        // ensureRendererStarted() reads it from surfaceView.holder.surface.
        rendererStarted = false
        currentUrl = null
        activeSurface = null
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
        pipController?.startPictureInPicture()
    }

    fun stopPictureInPicture() {
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

    // MARK: - Resume Recovery

    /**
     * Recreate the decoder when returning from the Android TV screensaver (or
     * app background) while paused. Triggered from the host activity's
     * onResume; the work is in [MPVLayerRenderer.recoverVideoOutput]. The
     * playing case is skipped — the render thread re-primes the VO on surface
     * reattach by itself — as is PiP (it owns its surface lifecycle).
     */
    private fun runResumeRecovery() {
        if (!rendererStarted) return
        if (pipController?.isPictureInPictureActive() == true) return
        if (intendedPlayState) return  // playing self-heals
        val surface = surfaceView.holder.surface?.takeIf { it.isValid }
        Log.i(TAG, "[Recover] onResume recovery — paused, surfaceValid=${surface != null}")
        renderer?.recoverVideoOutput(surface)
    }

    private fun registerLifecycleCallbacks() {
        if (lifecycleRegistered) return
        // Resume-recovery is TV-only. Only TV's zero-copy hwdec=mediacodec
        // binds MediaCodec directly to the display surface, so only TV needs
        // decoder recreation after a system-initiated surface loss (screensaver
        // / app background while paused). Phones (mediacodec-copy) and the
        // emulator self-heal via the surfaceCreated → attachSurface path, so we
        // don't even register there — no callback overhead, no spurious resets.
        if (renderer?.isTv != true) {
            Log.i(TAG, "[Recover] skipping lifecycle registration (isTv=${renderer?.isTv})")
            return
        }
        Log.i(TAG, "[Recover] registering lifecycle recovery (TV)")
        val app = context.applicationContext as? Application ?: run {
            Log.w(TAG, "Cannot register lifecycle callbacks: no Application")
            return
        }
        lifecycleCallbacks = object : Application.ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityStarted(activity: Activity) {}
            override fun onActivityResumed(activity: Activity) {
                val host = hostActivity ?: findActivity().also { hostActivity = it }
                if (activity !== host) {
                    if (host == null) {
                        Log.i(TAG, "[Recover] onActivityResumed — host unresolved, activity=${activity.javaClass.simpleName}; skipping")
                    }
                    return
                }
                Log.i(
                    TAG,
                    "[Recover] onActivityResumed — host resumed, hasMedia=${currentUrl != null}, pip=${pipController?.isPictureInPictureActive()}, paused=${!intendedPlayState}"
                )
                // Only recover when there's loaded media, we're paused, and not
                // in PiP. Playing self-heals; nothing loaded yet = nothing to
                // recover.
                if (currentUrl == null) return
                if (pipController?.isPictureInPictureActive() == true) return
                if (intendedPlayState) return
                // Post past the resume/surfaceCreated race so the holder has a
                // valid surface, then recreate the decoder against it.
                pipHandler.removeCallbacks(recoverResumeRunnable)
                pipHandler.postDelayed(recoverResumeRunnable, RESUME_RECOVERY_DELAY_MS)
            }
            override fun onActivityPaused(activity: Activity) {
                if (activity === hostActivity) {
                    Log.i(TAG, "[Recover] onActivityPaused — host paused")
                }
            }
            override fun onActivityStopped(activity: Activity) {
                if (activity === hostActivity) {
                    Log.i(TAG, "[Recover] onActivityStopped — host stopped")
                }
            }
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        }
        app.registerActivityLifecycleCallbacks(lifecycleCallbacks)
        lifecycleRegistered = true
    }

    private fun unregisterLifecycleCallbacks() {
        pipHandler.removeCallbacks(recoverResumeRunnable)
        if (!lifecycleRegistered) return
        val app = context.applicationContext as? Application
        lifecycleCallbacks?.let { app?.unregisterActivityLifecycleCallbacks(it) }
        lifecycleCallbacks = null
        lifecycleRegistered = false
    }

    private fun findActivity(): Activity? {
        // Prefer Expo's currentActivity. The view's Context is a ReactContext
        // whose base is the Application, not the Activity, so walking the
        // context chain does not reliably reach the Activity. Mirrors
        // PiPController.getActivity().
        appContext.currentActivity?.let { return it }
        var ctx: Context = context
        while (ctx is ContextWrapper) {
            if (ctx is Activity) return ctx
            ctx = ctx.baseContext
        }
        return null
    }

    // MARK: - Cleanup

    /**
     * Proactively tear down the player. Called from onDetachedFromWindow so
     * the app releases mpv + decoder buffers when the View detaches from the
     * window. The JS-facing destroy() is intentionally thinner (just
     * renderer.stop()) — see this thread for why the full teardown was kept
     * off the JS path.
     */
    fun cleanup() {
        pipHandler.removeCallbacksAndMessages(null)
        unregisterLifecycleCallbacks()
        pipController?.stopPictureInPicture()
        renderer?.stop()
        renderer?.delegate = null

        // SurfaceView owns the Surface via its holder — do NOT release it.
        activeSurface = null
        surfaceReady = false
        currentUrl = null
        rendererStarted = false
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        cleanup()
    }
}
