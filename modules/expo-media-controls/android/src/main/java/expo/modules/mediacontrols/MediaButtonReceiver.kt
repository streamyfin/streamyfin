package expo.modules.mediacontrols

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.view.KeyEvent
import androidx.media.session.MediaButtonReceiver as AndroidMediaButtonReceiver

/**
 * BroadcastReceiver that handles media button events from Bluetooth headsets
 * and other external media controllers.
 *
 * This receiver forwards all media button intents to the active MediaSession
 * managed by MediaControlsModule.
 */
class MediaButtonReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (Intent.ACTION_MEDIA_BUTTON == intent.action) {
            val keyEvent = intent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT)
            if (keyEvent != null) {
                // Forward the media button event to the MediaSession
                // The AndroidMediaButtonReceiver helper handles routing to the active session
                AndroidMediaButtonReceiver.handleIntent(
                    MediaControlsModule.getMediaSession(),
                    intent
                )
            }
        }
    }
}
