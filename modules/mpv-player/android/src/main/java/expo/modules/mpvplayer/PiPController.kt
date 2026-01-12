package expo.modules.mpvplayer

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Rect
import android.os.Build
import android.util.Log
import android.util.Rational
import android.view.View
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext

/**
 * Picture-in-Picture controller for Android.
 * This mirrors the iOS PiPController implementation.
 */
class PiPController(private val context: Context, private val appContext: AppContext? = null) {
    
    companion object {
        private const val TAG = "PiPController"
        private const val DEFAULT_ASPECT_WIDTH = 16
        private const val DEFAULT_ASPECT_HEIGHT = 9
    }
    
    interface Delegate {
        fun onPlay()
        fun onPause()
        fun onSeekBy(seconds: Double)
    }
    
    var delegate: Delegate? = null
    
    private var currentPosition: Double = 0.0
    private var currentDuration: Double = 0.0
    private var playbackRate: Double = 1.0
    
    // Video dimensions for proper aspect ratio
    private var videoWidth: Int = 0
    private var videoHeight: Int = 0
    
    // Reference to the player view for source rect
    private var playerView: View? = null
    
    /**
     * Check if Picture-in-Picture is supported on this device
     */
    fun isPictureInPictureSupported(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        } else {
            false
        }
    }
    
    /**
     * Check if Picture-in-Picture is currently active
     */
    fun isPictureInPictureActive(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val activity = getActivity()
            return activity?.isInPictureInPictureMode ?: false
        }
        return false
    }
    
    /**
     * Start Picture-in-Picture mode
     */
    fun startPictureInPicture() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val activity = getActivity()
            if (activity == null) {
                Log.e(TAG, "Cannot start PiP: no activity found")
                return
            }
            
            if (!isPictureInPictureSupported()) {
                Log.e(TAG, "PiP not supported on this device")
                return
            }
            
            try {
                val params = buildPiPParams(forEntering = true)
                activity.enterPictureInPictureMode(params)
                Log.i(TAG, "Entered PiP mode")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to enter PiP: ${e.message}")
            }
        } else {
            Log.w(TAG, "PiP requires Android O or higher")
        }
    }
    
    /**
     * Stop Picture-in-Picture mode
     */
    fun stopPictureInPicture() {
        // On Android, exiting PiP is typically done by the user
        // or by finishing the activity. We can request to move task to back.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val activity = getActivity()
            if (activity?.isInPictureInPictureMode == true) {
                // Move task to back which will exit PiP
                activity.moveTaskToBack(false)
            }
        }
    }
    
    /**
     * Update the current playback position and duration
     * Note: We don't update PiP params here as we're not using progress in PiP controls
     */
    fun setCurrentTime(position: Double, duration: Double) {
        currentPosition = position
        currentDuration = duration
    }
    
    /**
     * Set the playback rate (0.0 for paused, 1.0 for playing)
     */
    fun setPlaybackRate(rate: Double) {
        playbackRate = rate
        
        // Update PiP params to reflect play/pause state
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
    
    /**
     * Set the video dimensions for proper aspect ratio calculation
     */
    fun setVideoDimensions(width: Int, height: Int) {
        if (width > 0 && height > 0) {
            videoWidth = width
            videoHeight = height
            Log.i(TAG, "Video dimensions set: ${width}x${height}")
            
            // Update PiP params if active
            updatePiPParamsIfNeeded()
        }
    }
    
    /**
     * Set the player view reference for source rect hint
     */
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
    
    /**
     * Build Picture-in-Picture params for the current player state.
     * Calculates proper aspect ratio and source rect based on video and view dimensions.
     */
    @RequiresApi(Build.VERSION_CODES.O)
    private fun buildPiPParams(forEntering: Boolean = false): PictureInPictureParams {
        val view = playerView
        val viewWidth = view?.width ?: 0
        val viewHeight = view?.height ?: 0
        
        // Display aspect ratio from view (exactly like Findroid)
        val displayAspectRatio = Rational(viewWidth.coerceAtLeast(1), viewHeight.coerceAtLeast(1))
        
        // Video aspect ratio with 2.39:1 clamping (exactly like Findroid)
        // Findroid: Rational(it.width.coerceAtMost((it.height * 2.39f).toInt()), 
        //                    it.height.coerceAtMost((it.width * 2.39f).toInt()))
        val aspectRatio = if (videoWidth > 0 && videoHeight > 0) {
            Rational(
                videoWidth.coerceAtMost((videoHeight * 2.39f).toInt()),
                videoHeight.coerceAtMost((videoWidth * 2.39f).toInt())
            )
        } else {
            Rational(DEFAULT_ASPECT_WIDTH, DEFAULT_ASPECT_HEIGHT)
        }
        
        // Source rect hint calculation (exactly like Findroid)
        val sourceRectHint = if (viewWidth > 0 && viewHeight > 0 && videoWidth > 0 && videoHeight > 0) {
            if (displayAspectRatio < aspectRatio) {
                // Letterboxing - black bars top/bottom
                val space = ((viewHeight - (viewWidth.toFloat() / aspectRatio.toFloat())) / 2).toInt()
                Rect(
                    0,
                    space,
                    viewWidth,
                    (viewWidth.toFloat() / aspectRatio.toFloat()).toInt() + space
                )
            } else {
                // Pillarboxing - black bars left/right
                val space = ((viewWidth - (viewHeight.toFloat() * aspectRatio.toFloat())) / 2).toInt()
                Rect(
                    space,
                    0,
                    (viewHeight.toFloat() * aspectRatio.toFloat()).toInt() + space,
                    viewHeight
                )
            }
        } else {
            null
        }
        
        val builder = PictureInPictureParams.Builder()
            .setAspectRatio(aspectRatio)
        
        sourceRectHint?.let { builder.setSourceRectHint(it) }
        
        // On Android 12+, enable auto-enter (like Findroid)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(true)
        }
        
        return builder.build()
    }
    
    private fun getActivity(): Activity? {
        // First try Expo's AppContext (preferred in React Native)
        appContext?.currentActivity?.let { return it }
        
        // Fallback: Try to get from context wrapper chain
        var ctx = context
        while (ctx is android.content.ContextWrapper) {
            if (ctx is Activity) {
                return ctx
            }
            ctx = ctx.baseContext
        }
        return null
    }
    
    /**
     * Handle PiP action (called from activity when user taps PiP controls)
     */
    fun handlePiPAction(action: String) {
        when (action) {
            "play" -> delegate?.onPlay()
            "pause" -> delegate?.onPause()
            "skip_forward" -> delegate?.onSeekBy(10.0)
            "skip_backward" -> delegate?.onSeekBy(-10.0)
        }
    }
}

