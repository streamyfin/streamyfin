package expo.modules.musiccontrols

import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MusicControlsModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext).applicationContext

  private var mediaSession: MediaSession? = null
  private var enabled: Boolean = false

  override fun definition() = ModuleDefinition {
    Name("MusicControls")

    Events(
      "onPlay",
      "onPause",
      "onTogglePlayPause",
      "onNext",
      "onPrevious",
      "onSeekTo"
    )

    OnDestroy {
      disable()
    }

    Function("enable") {
      enable()
    }

    Function("disable") {
      disable()
    }

    Function("setNowPlaying") { metadata: Map<String, Any> ->
      setNowPlaying(metadata)
    }

    Function("setPlaybackState") { state: Map<String, Any> ->
      setPlaybackState(state)
    }
  }

  private fun ensureSession() {
    if (mediaSession != null) return

    val session = MediaSession(context, "StreamyfinMusic")
    session.setCallback(object : MediaSession.Callback() {
      override fun onPlay() {
        sendEvent("onPlay", mapOf<String, Any>())
      }

      override fun onPause() {
        sendEvent("onPause", mapOf<String, Any>())
      }

      override fun onSkipToNext() {
        sendEvent("onNext", mapOf<String, Any>())
      }

      override fun onSkipToPrevious() {
        sendEvent("onPrevious", mapOf<String, Any>())
      }

      override fun onSeekTo(pos: Long) {
        // Android reports milliseconds
        sendEvent("onSeekTo", mapOf("position" to (pos.toDouble() / 1000.0)))
      }

      override fun onPlayFromMediaId(mediaId: String?, extras: android.os.Bundle?) {
        sendEvent("onPlay", mapOf<String, Any>())
      }

      override fun onStop() {
        sendEvent("onPause", mapOf<String, Any>())
      }
    })

    mediaSession = session
  }

  private fun enable() {
    if (enabled) return
    enabled = true
    ensureSession()
    mediaSession?.isActive = true
  }

  private fun disable() {
    enabled = false
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
  }

  private fun setNowPlaying(metadata: Map<String, Any>) {
    if (!enabled) enable()
    ensureSession()

    val builder = MediaMetadata.Builder()
    (metadata["title"] as? String)?.let { builder.putString(MediaMetadata.METADATA_KEY_TITLE, it) }
    (metadata["artist"] as? String)?.let { builder.putString(MediaMetadata.METADATA_KEY_ARTIST, it) }
    (metadata["albumTitle"] as? String)?.let { builder.putString(MediaMetadata.METADATA_KEY_ALBUM, it) }

    val durationSeconds = when (val d = metadata["duration"]) {
      is Number -> d.toDouble()
      else -> null
    }
    durationSeconds?.let { builder.putLong(MediaMetadata.METADATA_KEY_DURATION, (it * 1000.0).toLong()) }

    mediaSession?.setMetadata(builder.build())
  }

  private fun setPlaybackState(state: Map<String, Any>) {
    if (!enabled) enable()
    ensureSession()

    val isPlaying = (state["isPlaying"] as? Boolean) == true

    val positionSeconds = when (val p = state["position"]) {
      is Number -> p.toDouble()
      else -> 0.0
    }
    val positionMs = (positionSeconds * 1000.0).toLong()

    val playbackState = if (isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED

    val actions =
      PlaybackState.ACTION_PLAY or
        PlaybackState.ACTION_PAUSE or
        PlaybackState.ACTION_PLAY_PAUSE or
        PlaybackState.ACTION_SKIP_TO_NEXT or
        PlaybackState.ACTION_SKIP_TO_PREVIOUS or
        PlaybackState.ACTION_SEEK_TO

    val builder = PlaybackState.Builder()
      .setActions(actions)
      .setState(playbackState, positionMs, if (isPlaying) 1.0f else 0.0f)

    mediaSession?.setPlaybackState(builder.build())
  }
}



