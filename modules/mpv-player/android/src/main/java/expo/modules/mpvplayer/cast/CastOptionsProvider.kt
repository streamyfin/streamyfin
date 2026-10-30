package expo.modules.mpvplayer.cast

import android.content.Context
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider
import com.google.android.gms.cast.framework.media.CastMediaOptions
import com.google.android.gms.cast.framework.media.ImagePicker
import com.google.android.gms.cast.framework.media.MediaIntentReceiver
import com.google.android.gms.cast.framework.media.NotificationOptions
import com.google.android.gms.common.images.WebImage
import expo.modules.mpvplayer.R

/**
 * Read by the Cast SDK through the manifest meta-data at first use. The receiver id comes
 * from the string resource the app's config plugin writes. The notification keeps the SDK's
 * controls and the expanded controls stay the SDK's, until the native chrome gets its remote
 * mode; the receiver is stopped with the session, so a stop from the phone also clears the TV.
 */
class CastOptionsProvider : OptionsProvider {
    override fun getCastOptions(context: Context): CastOptions {
        val notificationOptions = NotificationOptions.Builder()
            .setActions(
                listOf(
                    MediaIntentReceiver.ACTION_REWIND,
                    MediaIntentReceiver.ACTION_TOGGLE_PLAYBACK,
                    MediaIntentReceiver.ACTION_FORWARD,
                    MediaIntentReceiver.ACTION_STOP_CASTING,
                ),
                intArrayOf(1, 3),
            )
            .build()
        val mediaOptions = CastMediaOptions.Builder()
            .setImagePicker(FirstImagePicker())
            .setNotificationOptions(notificationOptions)
            .setExpandedControllerActivityClassName(CastExpandedControllerActivity::class.java.name)
            .build()
        return CastOptions.Builder()
            .setReceiverApplicationId(context.getString(R.string.streamyfin_cast_receiver_app_id))
            .setCastMediaOptions(mediaOptions)
            .setStopReceiverApplicationWhenEndingSession(true)
            .build()
    }

    override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null

    /** The receiver sends one artwork per item; the SDK asks for one per surface. */
    private class FirstImagePicker : ImagePicker() {
        override fun onPickImage(metadata: MediaMetadata?, type: Int): WebImage? =
            metadata?.images?.firstOrNull()
    }
}
