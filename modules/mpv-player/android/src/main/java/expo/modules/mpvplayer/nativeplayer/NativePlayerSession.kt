package expo.modules.mpvplayer.nativeplayer

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Rational
import android.view.KeyEvent
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.annotation.RequiresApi
import androidx.compose.ui.platform.ComposeView
import androidx.core.app.OnPictureInPictureModeChangedProvider
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import expo.modules.kotlin.Promise
import expo.modules.mpvplayer.MPVLayerRenderer
import expo.modules.mpvplayer.nativeplayer.ui.PlayerScreen
import expo.modules.mpvplayer.nativeplayer.ui.PlayerTheme

class NativePlayerSession(
    private val emit: (String, Map<String, Any?>) -> Unit,
    private val onTornDown: () -> Unit,
    private val presenterProvider: () -> Activity?
) : SurfaceHolder.Callback {

    companion object {
        private const val TAG = "NativePlayerSession"
    }

    val viewModel = PlayerViewModel()
    var renderer: MPVLayerRenderer? = null
    private var mediaSessionController: MediaSessionController? = null

    private var hostActivity: Activity? = null
    private var overlayContainer: FrameLayout? = null
    private var surfaceView: SurfaceView? = null
    private var composeView: ComposeView? = null

    private var surfaceReady = false
    private var isDismissing = false
    private var pendingConfig: PlayerPresentConfigRecord? = null

    private var pipReceiverRegistered = false
    private val mainHandler = Handler(Looper.getMainLooper())

    private val pipBroadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                PiPActions.ACTION_PIP_PLAY_PAUSE -> {
                    viewModel.togglePlayPause()
                    updatePiPParams(viewModel.isPlaying)
                }
                PiPActions.ACTION_PIP_SKIP_FORWARD -> {
                    viewModel.seekBy(15.0)
                }
                PiPActions.ACTION_PIP_SKIP_BACKWARD -> {
                    viewModel.seekBy(-15.0)
                }
            }
        }
    }

    init {
        viewModel.emit = emit
        viewModel.onDismissRequested = { reason ->
            dismiss(reason = reason)
        }
    }

    fun present(config: PlayerPresentConfigRecord, promise: Promise) {
        val activity = presenterProvider() ?: run {
            promise.reject("NO_PRESENTER", "Could not find an Activity to present the native player from", null)
            return
        }
        hostActivity = activity

        activity.runOnUiThread {
            try {
                val newRenderer = MPVLayerRenderer(activity)
                newRenderer.delegate = viewModel
                viewModel.renderer = newRenderer
                this.renderer = newRenderer

                // Claim ownership and start renderer
                newRenderer.start(voDriver = "gpu-next", owner = MpvOwnership.Owner.NATIVE_SESSION)

                // Initialize controllers
                val volumeCtrl = SystemVolumeController(activity)
                val brightnessCtrl = BrightnessController(activity)
                viewModel.volumeController = volumeCtrl
                viewModel.brightnessController = brightnessCtrl

                volumeCtrl.onExternalChange = {
                    viewModel.revealVolumeSliderTransiently()
                }
                volumeCtrl.onMuteStateChanged = { muted ->
                    emit("onMuteStateChanged", mapOf(
                        "muted" to muted,
                        "positionSec" to viewModel.displayPosition
                    ))
                }

                val mediaCtrl = MediaSessionController(activity, viewModel)
                mediaSessionController = mediaCtrl
                mediaCtrl.start()

                viewModel.apply(config)

                // Setup Overlay Views on MainActivity
                setupOverlay(activity, config)

                // Kick stream load
                startStream(config)

                promise.resolve(null)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to present native player: ${e.message}", e)
                teardownImmediately()
                promise.reject("PRESENT_FAILED", e.message, e)
            }
        }
    }

    private fun setupOverlay(activity: Activity, config: PlayerPresentConfigRecord) {
        val container = FrameLayout(activity).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            setOnKeyListener { _, keyCode, event ->
                if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                    dismiss("closeButton")
                    true
                } else false
            }
        }
        overlayContainer = container

        val sView = SurfaceView(activity).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        sView.holder.addCallback(this)
        sView.addOnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            val w = right - left
            val h = bottom - top
            if (w > 0 && h > 0 && (w != (oldRight - oldLeft) || h != (oldBottom - oldTop))) {
                renderer?.updateSurfaceSize(w, h)
            }
        }
        surfaceView = sView
        container.addView(sView)

        val cView = ComposeView(activity).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Install ViewTree owners so Compose functions properly on ReactActivity
        (activity as? LifecycleOwner)?.let { cView.setViewTreeLifecycleOwner(it) }
        (activity as? ViewModelStoreOwner)?.let { cView.setViewTreeViewModelStoreOwner(it) }
        (activity as? SavedStateRegistryOwner)?.let { cView.setViewTreeSavedStateRegistryOwner(it) }

        cView.setContent {
            PlayerTheme {
                PlayerScreen(
                    viewModel = viewModel,
                    onPipClick = if (isPiPSupported()) {
                        { enterPiP() }
                    } else null
                )
            }
        }
        composeView = cView
        container.addView(cView)

        // Immersive full-screen window insets
        try {
            val window = activity.window
            WindowCompat.setDecorFitsSystemWindows(window, false)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
            val insetsController = WindowCompat.getInsetsController(window, window.decorView)
            insetsController.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            insetsController.hide(WindowInsetsCompat.Type.systemBars())
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } catch (e: Exception) {
            Log.w(TAG, "Could not set immersive window insets: ${e.message}")
        }

        // Add overlay to activity window
        activity.addContentView(
            container,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        setupPiP(activity, config.ui.allowPip)
    }

    private fun setupPiP(activity: Activity, allowPip: Boolean) {
        if (!isPiPSupported()) return

        registerPiPReceiver(activity)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val params = PictureInPictureParams.Builder()
                    .setAutoEnterEnabled(allowPip)
                    .setAspectRatio(Rational(16, 9))
                    .setActions(PiPActions.buildActions(activity, viewModel.isPlaying))
                    .build()
                activity.setPictureInPictureParams(params)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to set initial PiP params: ${e.message}")
            }
        }

        if (activity is OnPictureInPictureModeChangedProvider) {
            (activity as OnPictureInPictureModeChangedProvider).addOnPictureInPictureModeChangedListener { info: PictureInPictureModeChangedInfo ->
                onPiPModeChanged(info.isInPictureInPictureMode)
            }
        }
    }

    private fun onPiPModeChanged(isInPiP: Boolean) {
        viewModel.isPipActive = isInPiP
        if (isInPiP) {
            viewModel.controlsVisible = false
            mainHandler.postDelayed({ syncSurfaceSize() }, 100)
            mainHandler.postDelayed({ syncSurfaceSize() }, 500)
        } else {
            mainHandler.postDelayed({ syncSurfaceSize() }, 100)
        }
        emit("onPictureInPictureChange", mapOf("isActive" to isInPiP))
    }

    fun isPiPSupported(): Boolean {
        val act = hostActivity ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            act.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        } else false
    }

    fun enterPiP() {
        val activity = hostActivity ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isPiPSupported()) {
            try {
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(16, 9))
                    .setActions(PiPActions.buildActions(activity, viewModel.isPlaying))
                    .build()
                activity.enterPictureInPictureMode(params)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to enter PiP: ${e.message}")
            }
        }
    }

    private fun updatePiPParams(isPlaying: Boolean) {
        val activity = hostActivity ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isPiPSupported()) {
            try {
                val builder = PictureInPictureParams.Builder()
                    .setActions(PiPActions.buildActions(activity, isPlaying))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    builder.setAutoEnterEnabled(viewModel.uiOptions.allowPip)
                }
                activity.setPictureInPictureParams(builder.build())
            } catch (e: Exception) {
                // Ignored
            }
        }
    }

    private fun registerPiPReceiver(context: Context) {
        if (pipReceiverRegistered) return
        try {
            val filter = IntentFilter().apply {
                addAction(PiPActions.ACTION_PIP_PLAY_PAUSE)
                addAction(PiPActions.ACTION_PIP_SKIP_FORWARD)
                addAction(PiPActions.ACTION_PIP_SKIP_BACKWARD)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(pipBroadcastReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                context.registerReceiver(pipBroadcastReceiver, filter)
            }
            pipReceiverRegistered = true
        } catch (e: Exception) {
            // Ignored
        }
    }

    private fun unregisterPiPReceiver(context: Context) {
        if (!pipReceiverRegistered) return
        try {
            context.unregisterReceiver(pipBroadcastReceiver)
            pipReceiverRegistered = false
        } catch (e: Exception) {
            // Ignored
        }
    }

    // MARK: - In-Place Stream Swap (load)
    fun load(config: PlayerPresentConfigRecord) {
        val activity = hostActivity
        val loadAction = {
            viewModel.prepareForReload()
            viewModel.apply(config)
            startStream(config, force = true)
        }
        if (activity != null && Looper.myLooper() != Looper.getMainLooper()) {
            activity.runOnUiThread { loadAction() }
        } else {
            loadAction()
        }
    }

    private fun startStream(config: PlayerPresentConfigRecord, force: Boolean = false) {
        val loadConfig = config.stream.toVideoLoadConfig() ?: return
        if (!surfaceReady) {
            pendingConfig = config
            return
        }

        renderer?.load(
            url = loadConfig.url,
            headers = loadConfig.headers,
            startPosition = loadConfig.startPosition,
            externalSubtitles = loadConfig.externalSubtitles,
            initialSubtitleId = loadConfig.initialSubtitleId,
            initialAudioId = loadConfig.initialAudioId,
            cacheEnabled = loadConfig.cacheEnabled,
            cacheSeconds = loadConfig.cacheSeconds,
            demuxerMaxBytes = loadConfig.demuxerMaxBytes,
            demuxerMaxBackBytes = loadConfig.demuxerMaxBackBytes
        )

        // mpv's pause property is global and survives loadfile, and keep-open=
        // always leaves it paused at EOF — so a swap into the next episode
        // inherits pause=yes and sits on the first frame. A fresh handle starts
        // unpaused, which is why only the swap looked broken. Mirror of
        // PlayerEngine.swift / MpvPlayerView.loadVideo: honor stream.autoplay.
        if (loadConfig.autoplay) {
            renderer?.play()
        }

        viewModel.setSpeed(config.ui.initialPlaybackSpeed)
        renderer?.setSubtitleDelay(viewModel.subtitleDelay)
        renderer?.setAudioDelay(viewModel.audioDelay)
        renderer?.setVolumeBoost(viewModel.volumeBoostPercent)
        renderer?.setDialogueBoost(viewModel.dialogueBoostEnabled)
        renderer?.setMonoDownmix(viewModel.monoAudioEnabled)

        config.subtitleStyle?.let { applySubtitleStyle(it) }
        viewModel.applyZoomState()
        mediaSessionController?.updateMetadata()

        // The engine has taken the stream — JS clears session.awaitingLoad on
        // this, and every awaitingLoad-gated listener (progress reporting,
        // next/previous episode, episode selection, quality, track changes)
        // stays dead until it fires. Mirror of PlayerEngine.swift's
        // `delegate?.engine(self, didLoad:)` at the end of load().
        emit("onLoad", mapOf("url" to loadConfig.url))
    }

    private fun applySubtitleStyle(style: SubtitleStyleRecord) {
        style.fontSize?.let { renderer?.setSubtitleFontSize(it) }
        style.scale?.let { renderer?.setSubtitleScale(it) }
        style.marginY?.let { renderer?.setSubtitleMarginY(it) }
        style.alignX?.let { renderer?.setSubtitleAlignX(it) }
        style.alignY?.let { renderer?.setSubtitleAlignY(it) }
        style.backgroundColor?.let { renderer?.setSubtitleBackgroundColor(it) }
        style.borderStyle?.let { renderer?.setSubtitleBorderStyle(it) }
        style.assOverride?.let { renderer?.setSubtitleAssOverride(it) }
    }

    private fun syncSurfaceSize() {
        if (!surfaceReady) return
        val w = surfaceView?.width ?: 0
        val h = surfaceView?.height ?: 0
        if (w > 0 && h > 0) {
            renderer?.updateSurfaceSize(w, h)
        }
    }

    // MARK: - SurfaceHolder.Callback
    override fun surfaceCreated(holder: SurfaceHolder) {
        surfaceReady = true
        renderer?.attachSurface(holder.surface)
        syncSurfaceSize()

        pendingConfig?.let { config ->
            pendingConfig = null
            startStream(config)
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
    }

    // MARK: - Teardown
    fun dismiss(reason: String, completion: (() -> Unit)? = null) {
        if (isDismissing) {
            completion?.invoke()
            return
        }
        isDismissing = true

        val activity = hostActivity
        val dismissAction = {
            viewModel.willTeardown()

            if (activity != null) {
                unregisterPiPReceiver(activity)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        activity.setPictureInPictureParams(
                            PictureInPictureParams.Builder().setAutoEnterEnabled(false).build()
                        )
                    } catch (e: Exception) {
                        // Ignored
                    }
                }
            }

            val position = viewModel.displayPosition
            val dur = viewModel.duration
            emit("onDismiss", mapOf(
                "positionSec" to position,
                "durationSec" to dur,
                "reason" to reason
            ))

            // Remove overlay container on main thread
            overlayContainer?.let { container ->
                (container.parent as? ViewGroup)?.removeView(container)
            }
            overlayContainer = null
            surfaceView = null
            composeView = null

            // Restore window state
            if (activity != null) {
                try {
                    val window = activity.window
                    val insetsController = WindowCompat.getInsetsController(window, window.decorView)
                    insetsController.show(WindowInsetsCompat.Type.systemBars())
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } catch (e: Exception) {
                    // Ignored
                }
            }

            viewModel.brightnessController?.restore()
            viewModel.volumeController?.unregister()
            mediaSessionController?.release()

            renderer?.stop()
            renderer = null
            hostActivity = null

            onTornDown()
            completion?.invoke()
        }

        if (activity != null && Looper.myLooper() != Looper.getMainLooper()) {
            activity.runOnUiThread { dismissAction() }
        } else {
            dismissAction()
        }
    }

    fun teardownImmediately() {
        if (isDismissing) return
        isDismissing = true
        val activity = hostActivity
        val teardownAction = {
            viewModel.willTeardown()
            overlayContainer?.let { container ->
                (container.parent as? ViewGroup)?.removeView(container)
            }
            overlayContainer = null
            surfaceView = null
            composeView = null
            activity?.let { unregisterPiPReceiver(it) }
            viewModel.brightnessController?.restore()
            viewModel.volumeController?.unregister()
            mediaSessionController?.release()
            renderer?.stop()
            renderer = null
            hostActivity = null
            onTornDown()
        }
        if (activity != null && Looper.myLooper() != Looper.getMainLooper()) {
            activity.runOnUiThread { teardownAction() }
        } else {
            teardownAction()
        }
    }
}
