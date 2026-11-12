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
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.VideoLoadConfig

/**
 * The embedded view. Only the subtitle preview in Settings uses it: a silent
 * clip whose subtitles follow the settings. It takes no media session, audio
 * focus, notification or picture in picture. Playback goes through the native
 * player (nativeplayer/).
 *
 * Uses SurfaceView (not TextureView) so the surface routes directly to
 * SurfaceFlinger (the OS compositor) rather than compositing into the
 * app's window surface. This matches mpv-android's architecture and
 * gives mpv a standalone surface.
 */
class MpvPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
    PlayerEngine.Delegate, SurfaceHolder.Callback {

    companion object {
        private const val TAG = "MpvPlayerView"

        // Grace window after onActivityResumed before running the resume
        // recovery, so surfaceCreated (surface-destroyed case) has fired and
        // the holder has a valid surface. If the surface survived the
        // screensaver and surfaceCreated never fires, this still runs.
        private const val RESUME_RECOVERY_DELAY_MS = 300L
    }

    val onTracksReady by EventDispatcher()

    private var surfaceView: SurfaceView
    private var renderer: MPVLayerRenderer? = null

    private var currentUrl: String? = null
    private var currentLoop: Boolean = false
    private var intendedPlayState: Boolean = false
    private var surfaceReady: Boolean = false
    private var pendingConfig: VideoLoadConfig? = null
    private var rendererStarted: Boolean = false

    private val mainHandler = Handler(Looper.getMainLooper())

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

        surfaceView = SurfaceView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        surfaceView.holder.addCallback(this@MpvPlayerView)
        addView(surfaceView)

        // Push dimension updates to mpv on every view bounds change, so it
        // resizes its EGL swapchain before rendering at the new size.
        surfaceView.addOnLayoutChangeListener { _, left, top, right, bottom,
                                                  oldLeft, oldTop, oldRight, oldBottom ->
            val w = right - left
            val h = bottom - top
            val oldW = oldRight - oldLeft
            val oldH = oldBottom - oldTop
            if (w > 0 && h > 0 && (w != oldW || h != oldH)) {
                updateSurfaceGeometry(w, h)
            }
        }

        // Watch the host activity's lifecycle to recover the video pipeline
        // when returning from the screensaver while paused.
        registerLifecycleCallbacks()
    }

    /** Starts the renderer on the first load, once the surface exists. */
    private fun ensureRendererStarted() {
        if (rendererStarted) {
            loadPendingVideo()
            return
        }

        try {
            val activeRenderer = renderer ?: MPVLayerRenderer(context).also { renderer = it }
            // Re-assert on every start: cleanup() nulls the delegate while
            // keeping the renderer instance.
            activeRenderer.delegate = this
            activeRenderer.start(PlayerEngine.Owner.EMBEDDED_VIEW) {
                rendererStarted = true

                // If the surface is already alive (surfaceCreated fired before
                // loadVideo), attach it now. With SurfaceView the surface is
                // owned by the holder, so we read it from there directly.
                surfaceView.holder.surface?.takeIf { it.isValid }?.let { surface ->
                    renderer?.attachSurface(surface)
                    syncSurfaceSizeToView()
                }
                loadPendingVideo()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start renderer: ${e.message}")
        }
    }

    private fun loadPendingVideo() {
        if (!rendererStarted || !surfaceReady) return
        pendingConfig?.let(::loadVideoInternal)
        pendingConfig = null
    }

    // MARK: - SurfaceHolder.Callback

    override fun surfaceCreated(holder: SurfaceHolder) {
        surfaceReady = true

        if (rendererStarted) {
            // The Surface is holder-owned; do NOT release it (SurfaceView
            // manages its lifecycle).
            renderer?.attachSurface(holder.surface)
            syncSurfaceSizeToView()
        }

        if (pendingConfig != null) ensureRendererStarted()
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        if (width > 0 && height > 0) {
            updateSurfaceGeometry(width, height)
        }
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        surfaceReady = false
        renderer?.detachSurface()
        // Do NOT issue mpv "stop" here. Playback continues against the
        // demuxer; when surfaceCreated fires again (app background /
        // foreground), we re-attach and frames resume. This matches the
        // keep-open=always setting in MPVLayerRenderer.
    }

    /** Read the actual SurfaceView width/height and push them to mpv. */
    private fun syncSurfaceSizeToView() {
        if (!surfaceReady) return
        val w = surfaceView.width
        val h = surfaceView.height
        if (w > 0 && h > 0) {
            updateSurfaceGeometry(w, h)
        }
    }

    private fun updateSurfaceGeometry(width: Int, height: Int) {
        renderer?.updateSurfaceSize(width, height)
    }

    // MARK: - Video Loading

    fun loadVideo(config: VideoLoadConfig) {
        // Skip reload if same URL and loop flag are already playing
        if (currentUrl == config.url && currentLoop == config.loop) {
            return
        }

        pendingConfig = config
        if (surfaceReady) {
            ensureRendererStarted()
        }
    }

    private fun loadVideoInternal(config: VideoLoadConfig) {
        currentUrl = config.url
        currentLoop = config.loop

        renderer?.load(config)

        if (config.autoplay) {
            play()
        }
    }

    private fun play() {
        intendedPlayState = true
        renderer?.play()
    }

    // MARK: - Subtitle Style

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

    fun setSubtitleStyle(config: Map<String, Any>) {
        renderer?.setSubtitleStyle(config)
    }

    fun setSubtitleAssOverride(mode: String) {
        renderer?.setSubtitleAssOverride(mode)
    }

    // MARK: - PlayerEngine.Delegate

    // The preview only waits for its tracks before styling the subtitles.
    override fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double) {}
    override fun onPauseChanged(isPaused: Boolean) {}
    override fun onLoadingChanged(isLoading: Boolean) {}
    override fun onReadyToSeek() {}
    override fun onVideoDimensionsChanged(width: Int, height: Int) {}

    override fun onTracksReady() {
        onTracksReady(emptyMap<String, Any>())
    }

    override fun onError(message: String) {
        Log.e(TAG, "Subtitle preview failed: $message")
    }

    // MARK: - Resume Recovery

    /**
     * Recreate the decoder when returning from the screensaver (or app
     * background). Triggered from the host activity's onResume; the work is in
     * [MPVLayerRenderer.recoverVideoOutput].
     */
    private fun runResumeRecovery() {
        if (!rendererStarted) return
        // Playing no longer self-heals: after the async-start/ownership rework
        // the VO doesn't reliably re-prime on surface re-attach, and with
        // FLAG_KEEP_SCREEN_ON now released on pause the screensaver can kill
        // the surface mid-playback too. Check the actual pipeline state —
        // audio can keep playing while the video track is dead (vid=no).
        val surface = surfaceView.holder.surface?.takeIf { it.isValid }
        val videoBroken = renderer?.isVideoOutputBroken() ?: false
        if (intendedPlayState && !videoBroken) {
            Log.i(TAG, "[Recover] onResume recovery — playing and pipeline healthy, skipping")
            return
        }
        Log.i(
            TAG,
            "[Recover] onResume recovery — paused=${!intendedPlayState}, videoBroken=$videoBroken, surfaceValid=${surface != null}"
        )
        renderer?.playbackResumeIntent = intendedPlayState
        renderer?.recoverVideoOutput(surface)
    }

    private fun registerLifecycleCallbacks() {
        if (lifecycleRegistered) return
        // Resume-recovery used to be TV-only (phones were assumed to self-heal
        // via surfaceCreated → attachSurface). That no longer holds: with
        // FLAG_KEEP_SCREEN_ON released on pause the screensaver can kill the
        // surface mid-playback on phones too, and the VO doesn't reliably
        // re-prime after the async-start/ownership rework — audio keeps
        // playing against a dead video track. Register everywhere.
        Log.i(TAG, "[Recover] registering lifecycle recovery")
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
                    "[Recover] onActivityResumed — host resumed, hasMedia=${currentUrl != null}, paused=${!intendedPlayState}"
                )
                // Only recover when there's loaded media. Playing-but-broken is
                // filtered inside runResumeRecovery via the actual pipeline
                // state, so healthy playback resumes with no reload.
                if (currentUrl == null) return
                // Post past the resume/surfaceCreated race so the holder has a
                // valid surface, then recreate the decoder against it.
                mainHandler.removeCallbacks(recoverResumeRunnable)
                mainHandler.postDelayed(recoverResumeRunnable, RESUME_RECOVERY_DELAY_MS)
            }
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivityStopped(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        }
        app.registerActivityLifecycleCallbacks(lifecycleCallbacks)
        lifecycleRegistered = true
    }

    private fun unregisterLifecycleCallbacks() {
        mainHandler.removeCallbacks(recoverResumeRunnable)
        if (!lifecycleRegistered) return
        val app = context.applicationContext as? Application
        lifecycleCallbacks?.let { app?.unregisterActivityLifecycleCallbacks(it) }
        lifecycleCallbacks = null
        lifecycleRegistered = false
    }

    private fun findActivity(): Activity? {
        // Prefer Expo's currentActivity. The view's Context is a ReactContext
        // whose base is the Application, not the Activity, so walking the
        // context chain does not reliably reach the Activity.
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
     * Tear down the player when the view detaches from the window, so mpv and
     * the decoder buffers are released.
     */
    private fun cleanup() {
        unregisterLifecycleCallbacks()
        renderer?.stop()
        renderer?.delegate = null

        surfaceReady = false
        pendingConfig = null
        currentUrl = null
        rendererStarted = false
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        cleanup()
    }
}
