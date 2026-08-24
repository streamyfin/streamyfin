package expo.modules.mpvplayer.nativeplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.File
import java.net.URL

class MediaSessionController(
    private val context: Context,
    private val viewModel: PlayerViewModel
) {
    companion object {
        private const val TAG = "MediaSessionController"
    }

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var mediaSession: MediaSession? = null
    private val scope = CoroutineScope(Dispatchers.IO)
    private var artworkJob: Job? = null

    private var audioFocusRequest: AudioFocusRequest? = null
    private var isDucked: Boolean = false
    private var noisyReceiverRegistered = false

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                Log.i(TAG, "Audio becoming noisy — pausing playback")
                viewModel.pause()
            }
        }
    }

    private val afChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                Log.i(TAG, "Audio focus lost ($focusChange) — pausing without auto-resume")
                viewModel.pause()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                Log.i(TAG, "Audio focus duck — lowering volume to 30%")
                isDucked = true
                viewModel.renderer?.setVolumeBoost(30)
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                if (isDucked) {
                    Log.i(TAG, "Audio focus gained — restoring volume")
                    isDucked = false
                    viewModel.renderer?.setVolumeBoost(viewModel.volumeBoostPercent)
                }
            }
        }
    }

    fun start() {
        if (mediaSession != null) return

        mediaSession = MediaSession(context, "StreamyfinNativePlayer").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() {
                    viewModel.play()
                }

                override fun onPause() {
                    viewModel.pause()
                }

                override fun onSeekTo(pos: Long) {
                    viewModel.seekTo(pos / 1000.0)
                }

                override fun onFastForward() {
                    viewModel.seekBy(15.0)
                }

                override fun onRewind() {
                    viewModel.seekBy(-15.0)
                }

                override fun onSkipToNext() {
                    if (viewModel.nextEpisode != null) {
                        viewModel.playNextEpisodeNow()
                    }
                }

                override fun onSkipToPrevious() {
                    viewModel.seekTo(0.0)
                }
            })
            setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS)
            isActive = true
        }

        requestAudioFocus()
        registerNoisyReceiver()
        updatePlaybackState()
        updateMetadata()
    }

    fun updatePlaybackState() {
        val session = mediaSession ?: return
        val isPlaying = viewModel.isPlaying
        val isBuffering = viewModel.isBuffering

        val state = when {
            isBuffering -> PlaybackState.STATE_BUFFERING
            isPlaying -> PlaybackState.STATE_PLAYING
            else -> PlaybackState.STATE_PAUSED
        }

        val positionMs = (viewModel.displayPosition * 1000).toLong()
        val speedFloat = if (isPlaying) viewModel.speed.toFloat() else 0f

        val actions = PlaybackState.ACTION_PLAY or
                PlaybackState.ACTION_PAUSE or
                PlaybackState.ACTION_PLAY_PAUSE or
                PlaybackState.ACTION_SEEK_TO or
                PlaybackState.ACTION_FAST_FORWARD or
                PlaybackState.ACTION_REWIND or
                PlaybackState.ACTION_SKIP_TO_NEXT or
                PlaybackState.ACTION_SKIP_TO_PREVIOUS

        val stateBuilder = PlaybackState.Builder()
            .setActions(actions)
            .setState(state, positionMs, speedFloat)

        session.setPlaybackState(stateBuilder.build())
    }

    fun updateMetadata() {
        val session = mediaSession ?: return
        val meta = viewModel.metadata

        val title = meta?.title ?: "Video"
        val subtitle = meta?.subtitle ?: ""
        val durationMs = (viewModel.duration * 1000).toLong()

        val builder = MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, subtitle)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)

        session.setMetadata(builder.build())

        meta?.artworkUri?.let { uri ->
            fetchArtworkAsync(uri, builder)
        }
    }

    private fun fetchArtworkAsync(artworkUri: String, baseBuilder: MediaMetadata.Builder) {
        artworkJob?.cancel()
        artworkJob = scope.launch {
            try {
                val bitmap = if (artworkUri.startsWith("file://")) {
                    val path = Uri.parse(artworkUri).path ?: artworkUri.removePrefix("file://")
                    BitmapFactory.decodeFile(File(path).absolutePath)
                } else {
                    val url = URL(artworkUri)
                    url.openStream().use { BitmapFactory.decodeStream(it) }
                }
                if (bitmap != null) {
                    baseBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, bitmap)
                    baseBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, bitmap)
                    mediaSession?.setMetadata(baseBuilder.build())
                }
            } catch (e: Exception) {
                // Ignore artwork fetch failures
            }
        }
    }

    private fun requestAudioFocus() {
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(audioAttributes)
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener(afChangeListener)
                .build()
            audioFocusRequest = req
            audioManager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                afChangeListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            )
        }
    }

    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(afChangeListener)
        }
    }

    private fun registerNoisyReceiver() {
        if (noisyReceiverRegistered) return
        try {
            val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
            context.registerReceiver(noisyReceiver, filter)
            noisyReceiverRegistered = true
        } catch (e: Exception) {
            // Ignored
        }
    }

    private fun unregisterNoisyReceiver() {
        if (!noisyReceiverRegistered) return
        try {
            context.unregisterReceiver(noisyReceiver)
            noisyReceiverRegistered = false
        } catch (e: Exception) {
            // Ignored
        }
    }

    fun release() {
        artworkJob?.cancel()
        unregisterNoisyReceiver()
        abandonAudioFocus()
        mediaSession?.let {
            it.isActive = false
            it.release()
        }
        mediaSession = null
    }
}
