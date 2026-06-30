package expo.modules.mpvplayer

import android.app.Activity
import android.app.Application
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Rational
import android.view.View
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext

class PiPController(private val context: Context, private val appContext: AppContext? = null) {

    companion object {
        private const val TAG = "PiPController"
        private const val DEFAULT_ASPECT_WIDTH = 16
        private const val DEFAULT_ASPECT_HEIGHT = 9
        private const val ACTION_PIP_PLAY_PAUSE = "expo.modules.mpvplayer.PIP_PLAY_PAUSE"
        private const val ACTION_PIP_SKIP_FORWARD = "expo.modules.mpvplayer.PIP_SKIP_FORWARD"
        private const val ACTION_PIP_SKIP_BACKWARD = "expo.modules.mpvplayer.PIP_SKIP_BACKWARD"
    }

    interface Delegate {
        fun onPlay()
        fun onPause()
        fun onSeekBy(seconds: Double)
        fun onPictureInPictureModeChanged(isInPiP: Boolean)
    }

    var delegate: Delegate? = null

    private var currentPosition: Double = 0.0
    private var currentDuration: Double = 0.0
    private var playbackRate: Double = 1.0
    // Independently tracks whether the system should auto-enter PiP on home
    // press. Decoupled from playbackRate so that disabling auto-enter
    // (e.g. when the player unmounts) doesn't corrupt the play/pause icon
    // state that buildPiPActions() derives from playbackRate.
    private var autoEnterEnabled: Boolean = false

    private var videoWidth: Int = 0
    private var videoHeight: Int = 0
    private var playerView: View? = null

    // PiP state tracking
    private var isInPiPMode: Boolean = false
    private var pipEntryNotified: Boolean = false
    private val pipHandler = Handler(Looper.getMainLooper())
    private var lifecycleCallbacks: Application.ActivityLifecycleCallbacks? = null
    private var lifecycleRegistered = false
    private var pipBroadcastReceiver: BroadcastReceiver? = null

    fun isPictureInPictureSupported(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        } else {
            false
        }
    }

    fun isPictureInPictureActive(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val activity = getActivity()
            return activity?.isInPictureInPictureMode ?: false
        }
        return false
    }

    fun startPictureInPicture() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val activity = getActivity() ?: run {
            Log.e(TAG, "Cannot start PiP: no activity")
            return
        }

        if (!isPictureInPictureSupported()) {
            Log.e(TAG, "PiP not supported on this device")
            return
        }

        try {
            val params = buildPiPParams(forEntering = true)
            val result = activity.enterPictureInPictureMode(params)

            if (!result) {
                Log.e(TAG, "enterPictureInPictureMode rejected by system")
                isInPiPMode = false
                return
            }

            isInPiPMode = true
            pipEntryNotified = true
            delegate?.onPictureInPictureModeChanged(true)
            registerLifecycleCallbacks()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to enter PiP: ${e.message}")
        }
    }

    fun stopPictureInPicture() {
        // Disable auto-enter eligibility without touching playbackRate.
        // playbackRate drives the play/pause icon in buildPiPActions();
        // mutating it here would cause a stale icon if PiP is re-entered
        // before the next playback state callback corrects it.
        autoEnterEnabled = false
        isInPiPMode = false
        pipEntryNotified = false
        unregisterLifecycleCallbacks()

        val activity = getActivity() ?: return

        // Push minimal params with just auto-enter disabled. Do NOT call
        // buildPiPParams() — it calls ensurePiPReceiverRegistered() and
        // setActions(), which would re-register the broadcast receiver
        // (just unregistered above) and attach play/pause/skip actions to
        // params being torn down. That leaves a live receiver + stale
        // actions after the player has unmounted.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                activity.setPictureInPictureParams(
                    PictureInPictureParams.Builder()
                        .setAutoEnterEnabled(false)
                        .build()
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear PiP auto-enter params: ${e.message}")
            }
        }
        if (activity.isInPictureInPictureMode) {
            activity.moveTaskToBack(false)
        }
    }

    fun isCurrentlyInPiP(): Boolean = isInPiPMode

    fun setCurrentTime(position: Double, duration: Double) {
        currentPosition = position
        currentDuration = duration
    }

    fun setPlaybackRate(rate: Double) {
        playbackRate = rate
        autoEnterEnabled = rate > 0

        if (rate > 0) {
            registerLifecycleCallbacks()
        }

        // Update PiP params so autoEnterEnabled and action icons track play/pause state
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val activity = getActivity()
            if (activity != null) {
                try {
                    activity.setPictureInPictureParams(buildPiPParams())
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to update PiP params: ${e.message}")
                }
            }
        }
    }

    fun setVideoDimensions(width: Int, height: Int) {
        if (width > 0 && height > 0) {
            videoWidth = width
            videoHeight = height
            updatePiPParamsIfNeeded()
        }
    }

    fun setPlayerView(view: View?) {
        playerView = view
    }

    private fun updatePiPParamsIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val activity = getActivity()
            if (activity?.isInPictureInPictureMode == true) {
                try {
                    activity.setPictureInPictureParams(buildPiPParams())
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to update PiP params: ${e.message}")
                }
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun buildPiPParams(forEntering: Boolean = false): PictureInPictureParams {
        val view = playerView
        val viewWidth = view?.width ?: 0
        val viewHeight = view?.height ?: 0

        val displayAspectRatio = Rational(viewWidth.coerceAtLeast(1), viewHeight.coerceAtLeast(1))

        // Video aspect ratio with 2.39:1 clamping
        val aspectRatio = if (videoWidth > 0 && videoHeight > 0) {
            Rational(
                videoWidth.coerceAtMost((videoHeight * 2.39f).toInt()),
                videoHeight.coerceAtMost((videoWidth * 2.39f).toInt())
            )
        } else {
            Rational(DEFAULT_ASPECT_WIDTH, DEFAULT_ASPECT_HEIGHT)
        }

        val sourceRectHint = if (viewWidth > 0 && viewHeight > 0 && videoWidth > 0 && videoHeight > 0) {
            if (displayAspectRatio < aspectRatio) {
                val space = ((viewHeight - (viewWidth.toFloat() / aspectRatio.toFloat())) / 2).toInt()
                Rect(0, space, viewWidth, (viewWidth.toFloat() / aspectRatio.toFloat()).toInt() + space)
            } else {
                val space = ((viewWidth - (viewHeight.toFloat() * aspectRatio.toFloat())) / 2).toInt()
                Rect(space, 0, (viewHeight.toFloat() * aspectRatio.toFloat()).toInt() + space, viewHeight)
            }
        } else {
            null
        }

        val builder = PictureInPictureParams.Builder()
            .setAspectRatio(aspectRatio)

        sourceRectHint?.let { builder.setSourceRectHint(it) }

        ensurePiPReceiverRegistered()
        builder.setActions(buildPiPActions())

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(forEntering || autoEnterEnabled)
        }

        return builder.build()
    }

    private fun getActivity(): Activity? {
        appContext?.currentActivity?.let { return it }

        var ctx = context
        while (ctx is android.content.ContextWrapper) {
            if (ctx is Activity) return ctx
            ctx = ctx.baseContext
        }
        return null
    }

    // MARK: - Lifecycle-based PiP Detection

    private fun registerLifecycleCallbacks() {
        if (lifecycleRegistered) return

        val app = context.applicationContext as? Application ?: run {
            Log.w(TAG, "Cannot access Application for lifecycle callbacks, falling back to polling")
            startFallbackPolling()
            return
        }

        lifecycleCallbacks = object : Application.ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityStarted(activity: Activity) {}

            override fun onActivityResumed(activity: Activity) {
                if (!isInPiPMode) return
                if (!activity.isInPictureInPictureMode) {
                    isInPiPMode = false
                    pipEntryNotified = false
                    delegate?.onPictureInPictureModeChanged(false)
                }
            }

            override fun onActivityPaused(activity: Activity) {
                // Proactively hide controls when user leaves while playing,
                // before the PiP window captures the UI. onActivityStopped
                // will restore if PiP didn't actually enter.
                if (playbackRate > 0 && !isInPiPMode) {
                    isInPiPMode = true
                    pipEntryNotified = true
                    delegate?.onPictureInPictureModeChanged(true)
                }
            }

            override fun onActivityStopped(activity: Activity) {
                pipHandler.postDelayed({
                    val inPip = activity.isInPictureInPictureMode

                    if (inPip && !isInPiPMode) {
                        isInPiPMode = true
                        pipEntryNotified = true
                        delegate?.onPictureInPictureModeChanged(true)
                        return@postDelayed
                    }

                    if (!isInPiPMode) return@postDelayed
                    if (inPip) return@postDelayed

                    // Not in PiP after 1s — check again to avoid false positive during transition
                    pipHandler.postDelayed({
                        if (!isInPiPMode) return@postDelayed
                        if (!activity.isInPictureInPictureMode) {
                            isInPiPMode = false
                            pipEntryNotified = false
                            delegate?.onPictureInPictureModeChanged(false)
                        }
                    }, 1500)
                }, 1000)
            }

            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

            override fun onActivityDestroyed(activity: Activity) {
                isInPiPMode = false
            }
        }

        app.registerActivityLifecycleCallbacks(lifecycleCallbacks)
        lifecycleRegistered = true
    }

    private fun unregisterLifecycleCallbacks() {
        if (!lifecycleRegistered) return
        lifecycleCallbacks?.let {
            (context.applicationContext as? Application)
                ?.unregisterActivityLifecycleCallbacks(it)
        }
        lifecycleCallbacks = null
        lifecycleRegistered = false
        pipHandler.removeCallbacksAndMessages(null)
        unregisterPiPBroadcastReceiver()
    }

    private fun startFallbackPolling() {
        var falseReadCount = 0
        pipHandler.removeCallbacksAndMessages(null)
        pipHandler.postDelayed(object : Runnable {
            override fun run() {
                if (!isInPiPMode) return

                var ctx = context
                var activity: Activity? = null
                while (ctx is android.content.ContextWrapper) {
                    if (ctx is Activity) { activity = ctx; break }
                    ctx = ctx.baseContext
                }

                val stillInPip = activity?.isInPictureInPictureMode == true

                if (!stillInPip) {
                    falseReadCount++
                    if (falseReadCount >= 3) {
                        isInPiPMode = false
                        delegate?.onPictureInPictureModeChanged(false)
                        return
                    }
                    pipHandler.postDelayed(this, 500)
                    return
                }

                falseReadCount = 0
                pipHandler.postDelayed(this, 1000)
            }
        }, 3000)
    }

    // MARK: - PiP Remote Actions

    private fun ensurePiPReceiverRegistered() {
        if (pipBroadcastReceiver != null) return

        pipBroadcastReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    ACTION_PIP_PLAY_PAUSE -> {
                        if (playbackRate > 0) delegate?.onPause() else delegate?.onPlay()
                    }
                    ACTION_PIP_SKIP_FORWARD -> delegate?.onSeekBy(10.0)
                    ACTION_PIP_SKIP_BACKWARD -> delegate?.onSeekBy(-10.0)
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(ACTION_PIP_PLAY_PAUSE)
            addAction(ACTION_PIP_SKIP_FORWARD)
            addAction(ACTION_PIP_SKIP_BACKWARD)
        }
        val registerFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Context.RECEIVER_EXPORTED
        } else {
            0
        }
        context.applicationContext.registerReceiver(pipBroadcastReceiver, filter, registerFlags)
    }

    private fun unregisterPiPBroadcastReceiver() {
        pipBroadcastReceiver?.let {
            try {
                context.applicationContext.unregisterReceiver(it)
            } catch (_: Exception) {}
        }
        pipBroadcastReceiver = null
    }

    private fun buildPiPActions(): List<RemoteAction> {
        val isPlaying = playbackRate > 0

        return listOf(
            RemoteAction(
                Icon.createWithResource(context, android.R.drawable.ic_media_rew),
                "Rewind", "Skip backward 10 seconds",
                createPiPPendingIntent(ACTION_PIP_SKIP_BACKWARD)
            ),
            RemoteAction(
                Icon.createWithResource(
                    context,
                    if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
                ),
                if (isPlaying) "Pause" else "Play",
                if (isPlaying) "Pause playback" else "Resume playback",
                createPiPPendingIntent(ACTION_PIP_PLAY_PAUSE)
            ),
            RemoteAction(
                Icon.createWithResource(context, android.R.drawable.ic_media_ff),
                "Fast Forward", "Skip forward 10 seconds",
                createPiPPendingIntent(ACTION_PIP_SKIP_FORWARD)
            )
        )
    }

    private fun createPiPPendingIntent(action: String): android.app.PendingIntent {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.app.PendingIntent.FLAG_IMMUTABLE
        } else {
            0
        }
        return android.app.PendingIntent.getBroadcast(
            context.applicationContext, 0, Intent(action), flags
        )
    }
}
