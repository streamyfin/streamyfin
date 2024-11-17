package expo.modules.vlcplayer

import android.content.Context
import android.util.Log
import android.view.ViewGroup
import android.widget.FrameLayout
import android.net.Uri
import androidx.lifecycle.LifecycleObserver
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.util.VLCVideoLayout

// Needs to inhert from MediaPlayer.EventListener
class VlcPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext), LifecycleObserver, MediaPlayer.EventListener {

    private var libVLC: LibVLC? = null
    private var mediaPlayer: MediaPlayer? = null
    private lateinit var videoLayout: VLCVideoLayout
    private var isPaused: Boolean = false
    private var isMediaReady: Boolean = false
    private var lastReportedState: Int? = null
    private var lastReportedIsPlaying: Boolean? = null
    private var startPosition: Int? = null

    init {
        setupView()
    }

    private fun setupView() {
        Log.d("VlcPlayerView", "Setting up view")
        setBackgroundColor(android.graphics.Color.WHITE)
        videoLayout = VLCVideoLayout(context).apply {
            layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
        }
        addView(videoLayout)
        Log.d("VlcPlayerView", "View setup complete")
    }

    fun setSource(source: Map<String, Any>) {
        val mediaOptions = source["mediaOptions"] as? Map<String, Any> ?: emptyMap()
        val initOptions = source["initOptions"] as? List<String> ?: emptyList()
        val uri = source["uri"] as? String
        val autoplay = source["autoplay"] as? Boolean ?: false
        val isNetwork = source["isNetwork"] as? Boolean ?: false
        startPosition = source["startPosition"] as? Int ?: 0

        // Handle video load start event
        // onVideoLoadStart?.invoke(mapOf("target" to reactTag ?: "null"))

        libVLC = LibVLC(context, initOptions)
        mediaPlayer = MediaPlayer(libVLC)
        mediaPlayer?.attachViews(videoLayout, null, false, false)
        mediaPlayer?.setEventListener(this)

        Log.d("VlcPlayerView", "Loading network file: $uri")
        val media = Media(libVLC, Uri.parse(uri))
        mediaPlayer?.media = media


        Log.d("VlcPlayerView", "Debug: Media options: $mediaOptions")
        // media.addOptions(mediaOptions)

        // Apply subtitle options
        // val subtitleTrackIndex = source["subtitleTrackIndex"] as? Int ?: -1
        // Log.d("VlcPlayerView", "Debug: Subtitle track index from source: $subtitleTrackIndex")

        // if (subtitleTrackIndex >= -1) {
        //     setSubtitleTrack(subtitleTrackIndex)
        //     Log.d("VlcPlayerView", "Debug: Set subtitle track to index: $subtitleTrackIndex")
        // } else {
        //     Log.d("VlcPlayerView", "Debug: Subtitle track index is less than -1, not setting")
        // }


        if (autoplay) {
            Log.d("VlcPlayerView", "Playing...")
            play()
            // if (startPosition > 0) {
            //     Log.d("VlcPlayerView", "Debug: Starting at position: $startPosition")
            //     seekTo(startPosition)
            // }
        }
    }

    fun play() {
        mediaPlayer?.play()
        isPaused = false
    }

    fun pause() {
        mediaPlayer?.pause()
        isPaused = true
    }

    fun stop() {
        mediaPlayer?.stop()
    }

    fun seekTo(time: Int) {
        mediaPlayer?.let { player ->
            val wasPlaying = player.isPlaying
            if (wasPlaying) {
                player.pause()
            }

            val duration = player.length.toInt()
            val seekTime = if (time > duration) duration - 1000 else time
            player.time = seekTime.toLong()

            if (wasPlaying) {
                player.play()
            }
        }
    }

    // fun setAudioTrack(trackIndex: Int) {
    //     mediaPlayer?.setAudioTrack(trackIndex)
    // }

    // fun getAudioTracks(): List<Map<String, Any>>? {
    //     val trackNames = mediaPlayer?.audioTrackNames ?: return null
    //     val trackIndexes = mediaPlayer?.audioTracks ?: return null

    //     return trackNames.zip(trackIndexes).map { (name, index) ->
    //         mapOf("name" to name, "index" to index)
    //     }
    // }

    // fun setSubtitleTrack(trackIndex: Int) {
    //     mediaPlayer?.setSpuTrack(trackIndex)
    // }

    // fun getSubtitleTracks(): List<Map<String, Any>>? {
    //     val trackNames = mediaPlayer?.spuTrackNames ?: return null
    //     val trackIndexes = mediaPlayer?.spuTracks ?: return null

    //     return trackNames.zip(trackIndexes).map { (name, index) ->
    //         mapOf("name" to name, "index" to index)
    //     }
    // }

    // fun setSubtitleURL(subtitleURL: String, name: String) {
    //     val media = mediaPlayer?.media ?: return
    //     media.addSlave(Media.Slave(Media.Slave.Type.Subtitle, subtitleURL, true))
    // }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        mediaPlayer?.release()
        libVLC?.release()
    }

    override fun onEvent(event: MediaPlayer.Event) {
        when (event.type) {
            MediaPlayer.Event.Playing,
            MediaPlayer.Event.Paused,
            MediaPlayer.Event.Stopped,
            MediaPlayer.Event.Buffering,
            MediaPlayer.Event.EndReached,
            MediaPlayer.Event.EncounteredError -> updatePlayerState(event)
            MediaPlayer.Event.TimeChanged -> updateVideoProgress()
        }
    }

    private fun updatePlayerState(event: MediaPlayer.Event) {
        val player = mediaPlayer ?: return
        val currentState = event.type

        val stateInfo = mutableMapOf<String, Any>(
            "target" to "null", // Replace with actual target if needed
            "currentTime" to player.time.toInt(),
            "duration" to (player.media?.duration?.toInt() ?: 0),
            "error" to false
        )

        when (currentState) {
            MediaPlayer.Event.Playing -> {
                stateInfo["isPlaying"] = true
                stateInfo["isBuffering"] = false
                stateInfo["state"] = "Playing"
            }
            MediaPlayer.Event.Paused -> {
                stateInfo["isPlaying"] = false
                stateInfo["state"] = "Paused"
            }
            MediaPlayer.Event.Buffering -> {
                stateInfo["isBuffering"] = true
                stateInfo["state"] = "Buffering"
            }
            MediaPlayer.Event.EncounteredError -> {
                Log.e("VlcPlayerView", "player.state ~ error")
                stateInfo["state"] = "Error"
                onVideoLoadEnd?.invoke(stateInfo)
            }
            MediaPlayer.Event.Opening -> {
                Log.d("VlcPlayerView", "player.state ~ opening")
                stateInfo["state"] = "Opening"
            }
        }

        // Determine if the media has finished loading
        if (player.isPlaying && !isMediaReady) {
            isMediaReady = true
            onVideoLoadEnd?.invoke(stateInfo)
            seekToStartTime()
        }

        if (lastReportedState != currentState || lastReportedIsPlaying != player.isPlaying) {
            lastReportedState = currentState
            lastReportedIsPlaying = player.isPlaying
            onVideoStateChange?.invoke(stateInfo)
        }
    }

    private fun seekToStartTime() {
        val player = mediaPlayer ?: return
        val startPosition = startPosition ?: return

        if (startPosition > 0) {
            Log.d("VlcPlayerView", "Debug: Seeking to start position: $startPosition")
            player.time = startPosition.toLong()

            // Ensure the player continues playing after seeking
            if (!player.isPlaying) {
                player.play()
            }
        }
    }

    private fun updateVideoProgress() {
        val player = mediaPlayer ?: return

        val currentTimeMs = player.time.toInt()
        val durationMs = player.media?.duration?.toInt() ?: 0

        println("currentTimeMs: $currentTimeMs")
        if (currentTimeMs >= 0 && currentTimeMs < durationMs) {
            onVideoProgress?.invoke(
                mapOf(
                    "currentTime" to currentTimeMs,
                    "duration" to durationMs
                )
            )
        }
    }

    var onVideoLoadEnd: ((Map<String, Any>) -> Unit)? = null
    var onVideoStateChange: ((Map<String, Any>) -> Unit)? = null
    var onVideoProgress: ((Map<String, Any>) -> Unit)? = null
}