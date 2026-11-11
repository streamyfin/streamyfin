package expo.modules.mpvplayer.playback

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * The media playback foreground service that keeps a video player audible
 * with the screen off. It holds no player itself: the [MediaPlaybackController]
 * of the current player owns the session and builds the notification, and this
 * service only puts that notification in the foreground.
 *
 * Started from [MediaPlaybackController.start] (a play request, so the app is
 * visible and allowed to start it) and stopped when that controller releases.
 */
class PlaybackService : Service() {

    companion object {
        private const val TAG = "PlaybackService"

        const val CHANNEL_ID = "streamyfin_video_playback"
        private const val NOTIFICATION_ID = 0x5F1D

        private const val ACTION_START = "expo.modules.mpvplayer.playback.START"
        const val ACTION_PLAY = "expo.modules.mpvplayer.playback.PLAY"
        const val ACTION_PAUSE = "expo.modules.mpvplayer.playback.PAUSE"
        const val ACTION_REWIND = "expo.modules.mpvplayer.playback.REWIND"
        const val ACTION_FORWARD = "expo.modules.mpvplayer.playback.FORWARD"

        @Volatile private var owner: MediaPlaybackController? = null
        @Volatile private var running = false
        // A start sent but not answered yet: stopping the service now would
        // kill the process, so onStartCommand answers it and stops instead.
        @Volatile private var startPending = false

        fun attach(context: Context, controller: MediaPlaybackController) {
            owner = controller
            // Already in the foreground (a player handing over to the next
            // one, possibly with the screen off): take over its notification.
            // Starting it again from the background would be refused.
            if (running) {
                refresh(context, controller)
                return
            }
            val intent = Intent(context, PlaybackService::class.java).setAction(ACTION_START)
            try {
                startPending = true
                ContextCompat.startForegroundService(context, intent)
            } catch (e: Exception) {
                startPending = false
                // ForegroundServiceStartNotAllowedException: the app is not
                // visible. Playback still works on screen, only the
                // background protection is missing.
                Log.w(TAG, "Could not start the playback service: ${e.message}")
            }
        }

        /**
         * Starts the service for [controller] if it should be running and is
         * not: an earlier start refused in the background. Never takes the
         * service from another player.
         */
        fun ensureStarted(context: Context, controller: MediaPlaybackController) {
            if (running || startPending) return
            if (owner != null && owner !== controller) return
            attach(context, controller)
        }

        fun refresh(context: Context, controller: MediaPlaybackController) {
            if (owner !== controller || !running) return
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.notify(NOTIFICATION_ID, controller.buildNotification(context))
            } catch (e: Exception) {
                Log.w(TAG, "Could not update the playback notification: ${e.message}")
            }
        }

        fun detach(context: Context, controller: MediaPlaybackController) {
            // A newer player already took over: leave its service alone.
            if (owner !== controller) return
            owner = null
            // The next owner must start the service again rather than post to
            // one that is going away.
            running = false
            if (startPending) return
            context.stopService(Intent(context, PlaybackService::class.java))
        }

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = NotificationChannel(CHANNEL_ID, "Video playback", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Controls for the video that is playing"
                setShowBadge(false)
            }
            nm.createNotificationChannel(channel)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startPending = false
        val controller = owner
        // Answer every start with startForeground() before anything else, even
        // when about to stop: a start left unanswered kills the process (see
        // .claude/learned-facts/foreground-service-start-must-be-answered.md).
        val notification = controller?.buildNotification(this) ?: placeholderNotification()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            running = controller != null
        } catch (e: Exception) {
            Log.w(TAG, "startForeground refused: ${e.message}")
        }

        if (controller == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action != ACTION_START) controller.handleAction(intent?.action)
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        owner?.onTaskRemoved()
        // Nothing may post to a service on its way out: a refresh landing
        // before onDestroy re-posted the media notification as a plain one
        // nothing cancelled. A start not answered yet is answered, then
        // stopped, in onStartCommand: stopping it here kills the process.
        running = false
        if (!startPending) stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        running = false
        super.onDestroy()
    }

    private fun placeholderNotification(): Notification {
        ensureChannel(this)
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Streamyfin")
            .build()
    }
}
