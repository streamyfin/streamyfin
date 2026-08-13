package expo.modules.mpvplayer.nativeplayer

import android.app.PendingIntent
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.drawable.Icon
import android.os.Build
import androidx.annotation.RequiresApi

object PiPActions {
    const val ACTION_PIP_PLAY_PAUSE = "expo.modules.mpvplayer.PIP_PLAY_PAUSE"
    const val ACTION_PIP_SKIP_FORWARD = "expo.modules.mpvplayer.PIP_SKIP_FORWARD"
    const val ACTION_PIP_SKIP_BACKWARD = "expo.modules.mpvplayer.PIP_SKIP_BACKWARD"

    private const val REQUEST_PLAY_PAUSE = 101
    private const val REQUEST_SKIP_FORWARD = 102
    private const val REQUEST_SKIP_BACKWARD = 103

    @RequiresApi(Build.VERSION_CODES.O)
    fun buildActions(context: Context, isPlaying: Boolean): List<RemoteAction> {
        val actions = mutableListOf<RemoteAction>()

        // 1. Skip Backward (-15s)
        val skipBackIntent = Intent(ACTION_PIP_SKIP_BACKWARD).setPackage(context.packageName)
        val skipBackPending = PendingIntent.getBroadcast(
            context,
            REQUEST_SKIP_BACKWARD,
            skipBackIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val backIcon = Icon.createWithResource(context, android.R.drawable.ic_media_rew)
        actions.add(RemoteAction(backIcon, "Seek -15s", "Seek -15s", skipBackPending))

        // 2. Play / Pause
        val playPauseIntent = Intent(ACTION_PIP_PLAY_PAUSE).setPackage(context.packageName)
        val playPausePending = PendingIntent.getBroadcast(
            context,
            REQUEST_PLAY_PAUSE,
            playPauseIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val playPauseIcon = if (isPlaying) {
            Icon.createWithResource(context, android.R.drawable.ic_media_pause)
        } else {
            Icon.createWithResource(context, android.R.drawable.ic_media_play)
        }
        actions.add(RemoteAction(playPauseIcon, if (isPlaying) "Pause" else "Play", if (isPlaying) "Pause" else "Play", playPausePending))

        // 3. Skip Forward (+15s)
        val skipFwdIntent = Intent(ACTION_PIP_SKIP_FORWARD).setPackage(context.packageName)
        val skipFwdPending = PendingIntent.getBroadcast(
            context,
            REQUEST_SKIP_FORWARD,
            skipFwdIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val fwdIcon = Icon.createWithResource(context, android.R.drawable.ic_media_ff)
        actions.add(RemoteAction(fwdIcon, "Seek +15s", "Seek +15s", skipFwdPending))

        return actions
    }
}
