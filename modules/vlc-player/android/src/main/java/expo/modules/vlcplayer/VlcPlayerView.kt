package expo.modules.vlcplayer

import android.R
import android.app.PendingIntent
import android.app.PendingIntent.FLAG_IMMUTABLE
import android.app.PendingIntent.FLAG_UPDATE_CURRENT
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.IntentFilter
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.app.ComponentActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleObserver
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.interfaces.IMedia
import org.videolan.libvlc.util.VLCVideoLayout


class VlcPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext), LifecycleObserver, MediaPlayer.EventListener {
    private val PIP_PLAY_PAUSE_ACTION = "PIP_PLAY_PAUSE_ACTION"
    private val PIP_REWIND_ACTION = "PIP_REWIND_ACTION"
    private val PIP_FORWARD_ACTION = "PIP_FORWARD_ACTION"

    private var libVLC: LibVLC? = null
    private var mediaPlayer: MediaPlayer? = null
    private lateinit var videoLayout: VLCVideoLayout
    private var isPaused: Boolean = false
    private var lastReportedState: Int? = null
    private var lastReportedIsPlaying: Boolean? = null
    private var media : Media? = null

    private val onVideoProgress by EventDispatcher()
    private val onVideoStateChange by EventDispatcher()
    private val onVideoLoadEnd by EventDispatcher()
    private val onPipStarted by EventDispatcher()

    private var startPosition: Int? = 0
    private var isMediaReady: Boolean = false
    private var externalTrack: Map<String, String>? = null
    var hasSource: Boolean = false

    private val handler = Handler(Looper.getMainLooper())
    private val updateInterval = 1000L // 1 second
    private val updateProgressRunnable = object : Runnable {
        override fun run() {
            updateVideoProgress()
            handler.postDelayed(this, updateInterval)
        }
    }
    private val currentActivity get() = context.findActivity()
    private val actions: MutableList<RemoteAction> = mutableListOf()

    private val actionReceiver: BroadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                PIP_PLAY_PAUSE_ACTION -> if (isPaused) play() else pause()
                PIP_FORWARD_ACTION -> seekTo((mediaPlayer?.time?.toInt() ?: 0) + 15_000)
                PIP_REWIND_ACTION -> seekTo((mediaPlayer?.time?.toInt() ?: 0) - 15_000)
            }
        }
    }

    init {
        setupView()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            setupPipActions()
            currentActivity.apply {
                setPictureInPictureParams(getPipParams()!!)
                addOnPictureInPictureModeChangedListener { info ->
                    onPipStarted(mapOf(
                        "pipStarted" to info.isInPictureInPictureMode
                    ))
                }
            }
        }
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

    @RequiresApi(Build.VERSION_CODES.O)
    private fun setupPipActions() {
        val remoteActionFilter = IntentFilter()
        val playPauseIntent: Intent = Intent(PIP_PLAY_PAUSE_ACTION).setPackage(context.packageName)
        val forwardIntent: Intent = Intent(PIP_FORWARD_ACTION).setPackage(context.packageName)
        val rewindIntent: Intent = Intent(PIP_REWIND_ACTION).setPackage(context.packageName)

        remoteActionFilter.addAction(PIP_PLAY_PAUSE_ACTION)
        remoteActionFilter.addAction(PIP_FORWARD_ACTION)
        remoteActionFilter.addAction(PIP_REWIND_ACTION)

        actions.addAll(
            listOf(
                RemoteAction(
                    Icon.createWithResource(context, R.drawable.ic_media_rew),
                    "Rewind",
                    "Rewind Video",
                    PendingIntent.getBroadcast(
                        context,
                        0,
                        rewindIntent,
                        FLAG_UPDATE_CURRENT or FLAG_IMMUTABLE
                    )
                ),
                RemoteAction(
                    Icon.createWithResource(context, R.drawable.ic_media_play),
                    "Play",
                    "Play Video",
                    PendingIntent.getBroadcast(
                        context,
                        0,
                        playPauseIntent,
                        FLAG_UPDATE_CURRENT or FLAG_IMMUTABLE
                    )
                ),
                RemoteAction(
                    Icon.createWithResource(context, R.drawable.ic_media_ff),
                    "Skip",
                    "Skip Forward",
                    PendingIntent.getBroadcast(
                        context,
                        0,
                        forwardIntent,
                        FLAG_UPDATE_CURRENT or FLAG_IMMUTABLE
                    )
                )
            )
        )

        ContextCompat.registerReceiver(
            context,
            actionReceiver,
            remoteActionFilter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    private fun getPipParams(): PictureInPictureParams? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            var builder = PictureInPictureParams.Builder()
                .setActions(actions)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builder = builder.setAutoEnterEnabled(true)
            }
            return builder.build()
        }
        return null
    }

    fun setSource(source: Map<String, Any>) {
        if (hasSource) {
            mediaPlayer?.attachViews(videoLayout, null, false, false)
            play()
            return
        }
        val mediaOptions = source["mediaOptions"] as? Map<String, Any> ?: emptyMap()
        val autoplay = source["autoplay"] as? Boolean ?: false
        val isNetwork = source["isNetwork"] as? Boolean ?: false
        externalTrack = source["externalTrack"] as? Map<String, String>
        startPosition = (source["startPosition"] as? Double)?.toInt() ?: 0

        val initOptions = source["initOptions"] as? MutableList<String> ?: mutableListOf()
        initOptions.add("--start-time=$startPosition")


        val uri = source["uri"] as? String

        // Handle video load start event
        // onVideoLoadStart?.invoke(mapOf("target" to reactTag ?: "null"))

        libVLC = LibVLC(context, initOptions)
        mediaPlayer = MediaPlayer(libVLC)
        mediaPlayer?.attachViews(videoLayout, null, false, false)
        mediaPlayer?.setEventListener(this)

        Log.d("VlcPlayerView", "Loading network file: $uri")
        media = Media(libVLC, Uri.parse(uri))
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

        hasSource = true

        if (autoplay) {
            Log.d("VlcPlayerView", "Playing...")
            play()
        }
    }

    fun startPictureInPicture() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            currentActivity.enterPictureInPictureMode(getPipParams()!!)
        }
    }

    fun play() {
        mediaPlayer?.play()
        isPaused = false
        handler.post(updateProgressRunnable) // Start updating progress
    }

    fun pause() {
        mediaPlayer?.pause()
        isPaused = true
        handler.removeCallbacks(updateProgressRunnable) // Stop updating progress
    }

    fun stop() {
        mediaPlayer?.stop()
        handler.removeCallbacks(updateProgressRunnable) // Stop updating progress
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

    fun setAudioTrack(trackIndex: Int) {
        mediaPlayer?.setAudioTrack(trackIndex)
    }

    fun getAudioTracks(): List<Map<String, Any>>? {

        println("getAudioTracks")
        println(mediaPlayer?.getAudioTracks())
        val trackDescriptions = mediaPlayer?.audioTracks ?: return null

        return trackDescriptions.map { trackDescription ->
            mapOf("name" to trackDescription.name, "index" to trackDescription.id)
        }
    }

    fun setSubtitleTrack(trackIndex: Int) {
        mediaPlayer?.setSpuTrack(trackIndex)
    }

    // fun getSubtitleTracks(): List<Map<String, Any>>? {
    //     return mediaPlayer?.getSpuTracks()?.map { trackDescription ->
    //         mapOf("name" to trackDescription.name, "index" to trackDescription.id)
    //     }
    // }

    fun getSubtitleTracks(): List<Map<String, Any>>? {
        val subtitleTracks = mediaPlayer?.spuTracks?.map { trackDescription ->
            mapOf("name" to trackDescription.name, "index" to trackDescription.id)
        }

        // Debug statement to print the result
        Log.d("VlcPlayerView", "Subtitle Tracks: $subtitleTracks")

        return subtitleTracks
    }

    fun setSubtitleURL(subtitleURL: String, name: String) {
        println("Setting subtitle URL: $subtitleURL, name: $name")
        mediaPlayer?.addSlave(IMedia.Slave.Type.Subtitle, Uri.parse(subtitleURL), true)
    }

    override fun onDetachedFromWindow() {
        println("onDetachedFromWindow")
        super.onDetachedFromWindow()
        mediaPlayer?.stop()
        handler.removeCallbacks(updateProgressRunnable) // Stop updating progress

        media?.release()
        mediaPlayer?.release()
        libVLC?.release()
        mediaPlayer = null
        media = null
        libVLC = null
    }

    override fun onEvent(event: MediaPlayer.Event) {
        when (event.type) {
            MediaPlayer.Event.Playing,
            MediaPlayer.Event.Paused,
            MediaPlayer.Event.Stopped,
            MediaPlayer.Event.Buffering,
            MediaPlayer.Event.EndReached,
            MediaPlayer.Event.EncounteredError -> updatePlayerState(event)
            MediaPlayer.Event.TimeChanged -> {
                // Do nothing here, as we are updating progress every 1 second
            }
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
                onVideoLoadEnd(stateInfo);
            }
            MediaPlayer.Event.Opening -> {
                Log.d("VlcPlayerView", "player.state ~ opening")
                stateInfo["state"] = "Opening"
            }
        }


        if (lastReportedState != currentState || lastReportedIsPlaying != player.isPlaying) {
            lastReportedState = currentState
            lastReportedIsPlaying = player.isPlaying
            onVideoStateChange(stateInfo)
        }
    }


    private fun updateVideoProgress() {
        val player = mediaPlayer ?: return

        val currentTimeMs = player.time.toInt()
        val durationMs = player.media?.duration?.toInt() ?: 0
        if (currentTimeMs >= 0 && currentTimeMs < durationMs) {
            // Set subtitle URL if available
            if (player.isPlaying && !isMediaReady) {
                isMediaReady = true
                externalTrack?.let {
                    val name = it["name"]
                    val deliveryUrl = it["DeliveryUrl"] ?: ""
                    if (!name.isNullOrEmpty() && !deliveryUrl.isNullOrEmpty()) {
                        setSubtitleURL(deliveryUrl, name)
                    }
                }
            }
            onVideoProgress(mapOf(
                "currentTime" to currentTimeMs,
                "duration" to durationMs
            ));
        }
    }
}

internal fun Context.findActivity(): androidx.activity.ComponentActivity {
    var context = this
    while (context is ContextWrapper) {
        if (context is androidx.activity.ComponentActivity) return context
        context = context.baseContext
    }
    throw IllegalStateException("Failed to find ComponentActivity")
}