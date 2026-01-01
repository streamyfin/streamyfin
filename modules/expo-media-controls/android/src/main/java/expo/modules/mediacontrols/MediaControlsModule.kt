package expo.modules.mediacontrols

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.database.ContentObserver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.VolumeProviderCompat
import androidx.media.session.MediaButtonReceiver as AndroidMediaButtonReceiver
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.net.URL

class MediaControlsModule : Module() {
  private var mediaSession: MediaSessionCompat? = null
    set(value) {
      field = value
      // Update the static reference for MediaButtonReceiver access
      Companion.mediaSessionInstance = value
    }
  private val coroutineScope = CoroutineScope(Dispatchers.IO)
  private var volumeObserver: ContentObserver? = null
  private var audioManager: AudioManager? = null
  private var remoteVolumeProvider: VolumeProviderCompat? = null
  private var artworkLoadingJob: kotlinx.coroutines.Job? = null

  override fun definition() = ModuleDefinition {
    Name("MediaControls")

    Events("play", "pause", "stop", "next", "previous", "seekTo", "volumeChange", "remoteVolumeChange")

    OnCreate {
      initializeMediaSession()
    }

    OnDestroy {
      disableVolumeMonitoring()
      cleanupMediaSession()
    }

    AsyncFunction("updateNowPlaying") { metadata: Map<String, Any?> ->
      updateNowPlaying(metadata)
    }

    AsyncFunction("clearNowPlaying") {
      clearNowPlaying()
    }

    AsyncFunction("enableVolumeMonitoring") {
      enableVolumeMonitoring()
    }

    AsyncFunction("disableVolumeMonitoring") {
      disableVolumeMonitoring()
    }

    AsyncFunction("enableRemoteVolume") { initialVolume: Int ->
      enableRemoteVolume(initialVolume)
    }

    AsyncFunction("disableRemoteVolume") {
      disableRemoteVolume()
    }

    AsyncFunction("updateRemoteVolume") { volume: Int ->
      updateRemoteVolume(volume)
    }
  }

  private fun initializeMediaSession() {
    val context = appContext.reactContext ?: return

    // Create ComponentName for MediaButtonReceiver to handle Bluetooth headset buttons
    val mediaButtonReceiverComponent = ComponentName(
      context,
      MediaButtonReceiver::class.java
    )

    // Create MediaSession with MediaButtonReceiver for Bluetooth support
    mediaSession = MediaSessionCompat(
      context,
      "StreamyfinMediaSession",
      mediaButtonReceiverComponent,
      null
    ).apply {
      // Set flags to handle media buttons and transport controls
      setFlags(
        MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
        MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
      )

      // Set callback for media button events
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() {
          sendEvent("play", emptyMap<String, Any>())
        }

        override fun onPause() {
          sendEvent("pause", emptyMap<String, Any>())
        }

        override fun onStop() {
          sendEvent("stop", emptyMap<String, Any>())
        }

        override fun onSkipToNext() {
          sendEvent("next", emptyMap<String, Any>())
        }

        override fun onSkipToPrevious() {
          sendEvent("previous", emptyMap<String, Any>())
        }

        override fun onSeekTo(pos: Long) {
          sendEvent("seekTo", mapOf("position" to pos / 1000.0))
        }
      })

      // Make the session active
      isActive = true
    }

    // Create notification channel for Android O+
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(
        "media_playback",
        "Media Playback",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Media playback controls"
        setShowBadge(false)
      }
      notificationManager.createNotificationChannel(channel)
    }
  }

  private fun cleanupMediaSession() {
    mediaSession?.apply {
      isActive = false
      release()
    }
    mediaSession = null
  }

  private fun updateNowPlaying(metadata: Map<String, Any?>) {
    val session = mediaSession ?: return
    val context = appContext.reactContext ?: return

    val title = metadata["title"] as? String ?: ""
    val artist = metadata["artist"] as? String ?: ""
    val album = metadata["album"] as? String ?: ""
    val artworkUrl = metadata["artwork"] as? String
    val duration = (metadata["duration"] as? Number)?.toLong() ?: 0L
    val position = (metadata["position"] as? Number)?.toLong() ?: 0L
    val isPlaying = metadata["isPlaying"] as? Boolean ?: false

    // Build metadata
    val metadataBuilder = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
      .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration * 1000)

    // Cancel any pending artwork loading to prevent stale metadata from overwriting
    artworkLoadingJob?.cancel()

    // Set metadata immediately without artwork (so track info updates right away)
    session.setMetadata(metadataBuilder.build())

    // Load artwork asynchronously and update metadata when ready
    if (artworkUrl != null) {
      artworkLoadingJob = coroutineScope.launch {
        try {
          val url = URL(artworkUrl)
          val bitmap = BitmapFactory.decodeStream(url.openStream())
          // Only update if this job wasn't cancelled (i.e., no new track was set)
          if (kotlinx.coroutines.isActive) {
            metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bitmap)
            session.setMetadata(metadataBuilder.build())
          }
        } catch (e: Exception) {
          // Artwork loading failed, metadata already set without it
        }
      }
    }

    // Update playback state
    val stateBuilder = PlaybackStateCompat.Builder()
      .setActions(
        PlaybackStateCompat.ACTION_PLAY or
        PlaybackStateCompat.ACTION_PAUSE or
        PlaybackStateCompat.ACTION_STOP or
        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
        PlaybackStateCompat.ACTION_SEEK_TO
      )
      .setState(
        if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
        position * 1000,
        1.0f
      )

    session.setPlaybackState(stateBuilder.build())

    // Show notification
    showNotification(context, title, artist, isPlaying)
  }

  private fun showNotification(context: Context, title: String, artist: String, isPlaying: Boolean) {
    val session = mediaSession ?: return

    val notification = NotificationCompat.Builder(context, "media_playback")
      .setContentTitle(title)
      .setContentText(artist)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setStyle(
        androidx.media.app.NotificationCompat.MediaStyle()
          .setMediaSession(session.sessionToken)
          .setShowActionsInCompactView(0, 1, 2)
      )
      .addAction(
        android.R.drawable.ic_media_previous,
        "Previous",
        AndroidMediaButtonReceiver.buildMediaButtonPendingIntent(
          context,
          PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
        )
      )
      .addAction(
        if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        if (isPlaying) "Pause" else "Play",
        AndroidMediaButtonReceiver.buildMediaButtonPendingIntent(
          context,
          if (isPlaying) PlaybackStateCompat.ACTION_PAUSE else PlaybackStateCompat.ACTION_PLAY
        )
      )
      .addAction(
        android.R.drawable.ic_media_next,
        "Next",
        AndroidMediaButtonReceiver.buildMediaButtonPendingIntent(
          context,
          PlaybackStateCompat.ACTION_SKIP_TO_NEXT
        )
      )
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(isPlaying)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()

    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.notify(1, notification)
  }

  private fun clearNowPlaying() {
    val context = appContext.reactContext ?: return

    mediaSession?.apply {
      setPlaybackState(
        PlaybackStateCompat.Builder()
          .setState(PlaybackStateCompat.STATE_STOPPED, 0, 0.0f)
          .build()
      )
    }

    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.cancel(1)
  }

  private fun enableVolumeMonitoring() {
    val context = appContext.reactContext ?: return

    // Get AudioManager
    audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    // Create volume observer
    volumeObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
      override fun onChange(selfChange: Boolean) {
        super.onChange(selfChange)

        val am = audioManager ?: return
        val currentVolume = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        val maxVolume = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val volumePercent = (currentVolume.toFloat() / maxVolume.toFloat() * 100).toInt()

        // Send volume change event to JavaScript
        sendEvent("volumeChange", mapOf("volume" to volumePercent))
      }
    }

    // Register observer for media volume changes
    context.contentResolver.registerContentObserver(
      Settings.System.CONTENT_URI,
      true,
      volumeObserver!!
    )
  }

  private fun disableVolumeMonitoring() {
    val context = appContext.reactContext ?: return

    volumeObserver?.let {
      context.contentResolver.unregisterContentObserver(it)
      volumeObserver = null
    }

    audioManager = null
  }

  private fun enableRemoteVolume(initialVolume: Int) {
    val session = mediaSession ?: return

    // Ensure MediaSession is active
    if (!session.isActive) {
      session.isActive = true
    }

    // Ensure MediaSession has metadata (required for Android to show volume UI)
    // Set placeholder metadata if none exists
    if (session.controller?.metadata == null) {
      val placeholderMetadata = MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "Remote Playback")
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Jellyfin")
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, 0)
        .build()
      session.setMetadata(placeholderMetadata)
    }

    // Create a VolumeProvider for remote volume control (like Jellyfin app)
    remoteVolumeProvider = object : VolumeProviderCompat(
      VolumeProviderCompat.VOLUME_CONTROL_ABSOLUTE, // Control type: absolute volume
      100, // Max volume (0-100)
      initialVolume // Initial volume
    ) {
      override fun onSetVolumeTo(volume: Int) {
        // User adjusted volume to specific level via system controls
        // Matches Jellyfin app: webappFunctionChannel.setVolume(volume)
        // Send SetVolume command to Jellyfin session
        currentVolume = volume
        sendEvent("remoteVolumeChange", mapOf(
          "command" to "SetVolume",
          "volume" to volume
        ))
      }

      override fun onAdjustVolume(direction: Int) {
        // User pressed volume up/down buttons
        // Matches Jellyfin app: callPlaybackManagerAction(PLAYBACK_MANAGER_COMMAND_VOL_UP/DOWN)
        when (direction) {
          AudioManager.ADJUST_RAISE -> {
            currentVolume = (currentVolume + 2).coerceAtMost(100)
            // Send VolumeUp command to Jellyfin session
            sendEvent("remoteVolumeChange", mapOf(
              "command" to "VolumeUp"
            ))
          }
          AudioManager.ADJUST_LOWER -> {
            currentVolume = (currentVolume - 2).coerceAtLeast(0)
            // Send VolumeDown command to Jellyfin session
            sendEvent("remoteVolumeChange", mapOf(
              "command" to "VolumeDown"
            ))
          }
        }
      }
    }

    // Ensure MediaSession has a valid playback state
    // This is required for Android to show the system volume UI
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setState(PlaybackStateCompat.STATE_PLAYING, 0, 1.0f)
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
          PlaybackStateCompat.ACTION_PAUSE or
          PlaybackStateCompat.ACTION_STOP or
          PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
          PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
        )
        .build()
    )

    // Set the volume provider on the media session
    session.setPlaybackToRemote(remoteVolumeProvider)
  }

  private fun disableRemoteVolume() {
    val session = mediaSession ?: return

    // Switch back to local playback (removes the second volume bar)
    session.setPlaybackToLocal(AudioManager.STREAM_MUSIC)
    remoteVolumeProvider = null
  }

  private fun updateRemoteVolume(volume: Int) {
    // Update the volume provider's current volume
    remoteVolumeProvider?.currentVolume = volume.coerceIn(0, 100)
  }

  companion object {
    private const val ADJUST_RAISE = 1
    private const val ADJUST_LOWER = -1

    // Static reference to the MediaSession for MediaButtonReceiver access
    @Volatile
    private var mediaSessionInstance: MediaSessionCompat? = null

    /**
     * Get the current MediaSession instance.
     * Used by MediaButtonReceiver to forward Bluetooth media button events.
     */
    @JvmStatic
    fun getMediaSession(): MediaSessionCompat? = mediaSessionInstance
  }
}
