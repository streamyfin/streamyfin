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
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.net.URL

// Data class for queue track metadata (used for optimistic skip updates)
data class QueueTrack(
  val title: String,
  val artist: String,
  val album: String,
  val artwork: String?,
  val duration: Long
)

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
  private var isRemoteVolumeEnabled = false
  private var artworkLoadingJob: kotlinx.coroutines.Job? = null
  // Track current playback state for optimistic updates on lock screen
  // This ensures the lock screen UI stays responsive even when JS is suspended
  private var currentIsPlaying: Boolean = false
  private var currentTitle: String = ""
  private var currentArtist: String = ""
  private var currentPosition: Long = 0
  private var currentDuration: Long = 0
  // Queue metadata for optimistic skip updates
  private var queue: List<QueueTrack> = emptyList()
  private var queueIndex: Int = 0

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

    AsyncFunction("setQueue") { tracks: List<Map<String, Any?>>, index: Int ->
      setQueue(tracks, index)
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
          // Optimistically update lock screen state immediately
          // This ensures UI stays responsive even when JS runtime is suspended
          currentIsPlaying = true
          updatePlaybackStateOptimistic(true)
          sendEvent("play", emptyMap<String, Any>())
        }

        override fun onPause() {
          // Optimistically update lock screen state immediately
          currentIsPlaying = false
          updatePlaybackStateOptimistic(false)
          sendEvent("pause", emptyMap<String, Any>())
        }

        override fun onStop() {
          currentIsPlaying = false
          updatePlaybackStateOptimistic(false)
          sendEvent("stop", emptyMap<String, Any>())
        }

        override fun onSkipToNext() {
          // Optimistically update to next track if we have queue info
          if (queue.isNotEmpty() && queueIndex < queue.size - 1) {
            queueIndex++
            updateMetadataFromQueueOptimistic()
          }
          sendEvent("next", emptyMap<String, Any>())
        }

        override fun onSkipToPrevious() {
          // Optimistically update to previous track if we have queue info
          if (queue.isNotEmpty() && queueIndex > 0) {
            queueIndex--
            updateMetadataFromQueueOptimistic()
          }
          sendEvent("previous", emptyMap<String, Any>())
        }

        override fun onSeekTo(pos: Long) {
          currentPosition = pos / 1000
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

  /**
   * Optimistically update the playback state when lock screen buttons are pressed.
   * This ensures the UI stays responsive even when the JS runtime is suspended in background.
   */
  private fun updatePlaybackStateOptimistic(isPlaying: Boolean) {
    val session = mediaSession ?: return
    val context = appContext.reactContext ?: return

    // Update playback state immediately
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
        currentPosition * 1000,
        1.0f
      )
    session.setPlaybackState(stateBuilder.build())

    // Update notification with new play/pause button
    showNotification(context, currentTitle, currentArtist, isPlaying)
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

    // Store current state for optimistic updates when buttons are pressed on lock screen
    currentTitle = title
    currentArtist = artist
    currentPosition = position
    currentDuration = duration
    currentIsPlaying = isPlaying

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
          if (isActive) {
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

    isRemoteVolumeEnabled = true

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
        // Guard: ignore if remote volume has been disabled
        if (!isRemoteVolumeEnabled) return

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
        // Guard: ignore if remote volume has been disabled
        if (!isRemoteVolumeEnabled) return

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
    // Disable the flag first to prevent any pending callbacks from sending events
    isRemoteVolumeEnabled = false

    val session = mediaSession ?: return

    // Switch back to local playback (removes the second volume bar)
    session.setPlaybackToLocal(AudioManager.STREAM_MUSIC)
    remoteVolumeProvider = null
  }

  private fun updateRemoteVolume(volume: Int) {
    // Update the volume provider's current volume
    remoteVolumeProvider?.currentVolume = volume.coerceIn(0, 100)
  }

  private fun setQueue(tracks: List<Map<String, Any?>>, index: Int) {
    queue = tracks.map { track ->
      QueueTrack(
        title = track["title"] as? String ?: "",
        artist = track["artist"] as? String ?: "",
        album = track["album"] as? String ?: "",
        artwork = track["artwork"] as? String,
        duration = (track["duration"] as? Number)?.toLong() ?: 0L
      )
    }
    queueIndex = index.coerceIn(0, (queue.size - 1).coerceAtLeast(0))
  }

  /**
   * Optimistically update metadata from queue when skip is pressed on lock screen.
   * This ensures the UI updates immediately even when JS runtime is suspended.
   */
  private fun updateMetadataFromQueueOptimistic() {
    val session = mediaSession ?: return
    val context = appContext.reactContext ?: return

    if (queue.isEmpty() || queueIndex < 0 || queueIndex >= queue.size) return

    val track = queue[queueIndex]

    // Update cached state
    currentTitle = track.title
    currentArtist = track.artist
    currentDuration = track.duration
    currentPosition = 0 // Reset position for new track
    // Keep currentIsPlaying as-is (skip doesn't change play state)

    // Cancel any pending artwork loading
    artworkLoadingJob?.cancel()

    // Build metadata
    val metadataBuilder = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, track.title)
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, track.artist)
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, track.album)
      .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, track.duration * 1000)

    // Set metadata immediately without artwork
    session.setMetadata(metadataBuilder.build())

    // Update playback state with reset position
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
        if (currentIsPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
        0, // Reset position to 0 for new track
        1.0f
      )
    session.setPlaybackState(stateBuilder.build())

    // Update notification
    showNotification(context, track.title, track.artist, currentIsPlaying)

    // Load artwork asynchronously
    if (track.artwork != null) {
      artworkLoadingJob = coroutineScope.launch {
        try {
          val url = URL(track.artwork)
          val bitmap = BitmapFactory.decodeStream(url.openStream())
          if (isActive) {
            metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bitmap)
            session.setMetadata(metadataBuilder.build())
          }
        } catch (e: Exception) {
          // Artwork loading failed, metadata already set without it
        }
      }
    }
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
