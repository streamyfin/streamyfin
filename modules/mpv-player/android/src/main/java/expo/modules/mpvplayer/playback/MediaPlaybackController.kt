package expo.modules.mpvplayer.playback

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * Everything a video player needs to keep playing with the screen off:
 * a media session (lock screen, notification and headset controls), audio
 * focus, the headphones-unplugged pause, a CPU wake lock (and a Wi-Fi lock for
 * network streams) while playing, and the media playback foreground service.
 *
 * Android 17 mutes the audio of an app that is neither visible nor running a
 * foreground service ("AudioHardening background playback muted ... level:
 * partial" in logcat), and mpv's clock follows the audio, so without the
 * service playback stalls a few seconds after the screen goes off.
 *
 * One controller per player. Only one is the foreground owner at a time, the
 * most recent to [start]; see [PlaybackService].
 */
class MediaPlaybackController(
    context: Context,
    private val target: MediaPlaybackTarget,
    private val sessionTag: String,
) {
    companion object {
        private const val TAG = "MediaPlaybackController"


        // A position report further than this from where the session's
        // extrapolation says it should be is a seek or a stall: republish.
        private const val POSITION_DRIFT_REPUBLISH_MS = 1500L
        // The locks hold while playback advances. A load that failed or a stream
        // that died never leaves the playing state (mpv reports neither), and they
        // were held until the player closed, all night with the phone locked.
        internal const val LOCKS_WITHOUT_PROGRESS_MS = 10 * 60 * 1000L

        private const val ARTWORK_MAX_PX = 512
        // A poster is a few hundred KB; anything past this is not one.
        private const val ARTWORK_MAX_BYTES = 8 * 1024 * 1024
        // Offline the artwork request fails; retry on later state changes,
        // no more often than this, so it shows up once the network is back.
        private const val ARTWORK_RETRY_MS = 30_000L
        private const val ARTWORK_TIMEOUT_MS = 8000
    }

    private val context: Context = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val artworkExecutor = Executors.newSingleThreadExecutor()
    private val audioManager = this.context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private var mediaSession: MediaSession? = null
    private var released = false

    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false
    private var isDucked = false
    private var noisyReceiverRegistered = false

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    private var artworkBitmap: Bitmap? = null
    private var artworkUriLoaded: String? = null
    private var artworkFailedAt = 0L
    private var publishedDurationMs = -1L

    // What the last published PlaybackState said, to detect seeks between ticks.
    private var publishedPositionMs = 0L
    private var publishedAtRealtime = 0L
    private var publishedSpeed = 0f

    val sessionToken: MediaSession.Token? get() = mediaSession?.sessionToken

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                Log.i(TAG, "Audio becoming noisy — pausing playback")
                target.pauseForInterruption()
            }
        }
    }

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        mainHandler.post { onAudioFocusChange(change) }
    }

    // MARK: - Lifecycle

    /**
     * Must be called while the app is visible (a play request), since that is
     * when Android allows starting a media playback foreground service.
     */
    fun start() {
        if (mediaSession != null || released) return

        mediaSession = MediaSession(context, sessionTag).apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = target.play()
                override fun onPause() = target.pause()
                override fun onSeekTo(pos: Long) {
                    if (target.canSeek) target.seekTo(pos / 1000.0)
                }
                override fun onFastForward() {
                    if (target.canSeek) target.seekBy(target.seekForwardSeconds)
                }
                override fun onRewind() {
                    if (target.canSeek) target.seekBy(-target.seekBackSeconds)
                }
                override fun onSkipToNext() {
                    if (target.canSkipToNext) target.skipToNext()
                }
                override fun onSkipToPrevious() {
                    if (target.canSkipToPrevious && target.canSeek) target.skipToPrevious()
                }
                override fun onStop() = target.stop()
            })
            launchPendingIntent()?.let { setSessionActivity(it) }
            isActive = true
        }

        registerNoisyReceiver()
        if (target.isPlaying) requestAudioFocus()
        updateMetadata()
        updatePlaybackState()
        PlaybackService.attach(context, this)
    }

    fun release() {
        if (released) return
        released = true
        mainHandler.removeCallbacksAndMessages(null)
        artworkExecutor.shutdownNow()
        PlaybackService.detach(context, this)
        unregisterNoisyReceiver()
        abandonAudioFocus()
        releaseLocks()
        mediaSession?.let {
            it.isActive = false
            it.release()
        }
        mediaSession = null
    }

    // MARK: - State

    fun updatePlaybackState() {
        val session = mediaSession ?: return
        val playing = target.isPlaying
        val state = when {
            target.isBuffering && playing -> PlaybackState.STATE_BUFFERING
            playing -> PlaybackState.STATE_PLAYING
            else -> PlaybackState.STATE_PAUSED
        }
        val positionMs = (target.positionSeconds * 1000).toLong().coerceAtLeast(0)
        val speed = if (playing && !target.isBuffering) target.playbackSpeed.toFloat() else 0f

        var actions = PlaybackState.ACTION_PLAY or
            PlaybackState.ACTION_PAUSE or
            PlaybackState.ACTION_PLAY_PAUSE
        if (target.canSeek) {
            actions = actions or
                PlaybackState.ACTION_SEEK_TO or
                PlaybackState.ACTION_FAST_FORWARD or
                PlaybackState.ACTION_REWIND
            if (target.canSkipToPrevious) actions = actions or PlaybackState.ACTION_SKIP_TO_PREVIOUS
        }
        if (target.canSkipToNext) actions = actions or PlaybackState.ACTION_SKIP_TO_NEXT

        session.setPlaybackState(
            PlaybackState.Builder()
                .setActions(actions)
                .setState(state, positionMs, speed)
                .build()
        )
        publishedPositionMs = positionMs
        publishedAtRealtime = SystemClock.elapsedRealtime()
        publishedSpeed = speed

        if (playing) {
            // Never play over whoever holds the focus (a call): refused,
            // the player pauses and this runs again with playing false.
            if (!hasAudioFocus && !requestAudioFocus()) {
                Log.i(TAG, "Audio focus refused — pausing")
                target.pauseForRefusedFocus()
                return
            }
            acquireLocks()
            // A start refused while the app was in the background is
            // retried on the next play the user makes in front of it.
            PlaybackService.ensureStarted(context, this)
        } else {
            releaseLocks()
        }
        retryArtworkIfDue()
        PlaybackService.refresh(context, this)
    }

    private fun retryArtworkIfDue() {
        if (artworkBitmap != null || artworkFailedAt == 0L) return
        if (SystemClock.elapsedRealtime() - artworkFailedAt < ARTWORK_RETRY_MS) return
        val info = target.nowPlaying ?: return
        val uri = info.artworkUri?.takeIf { it == artworkUriLoaded } ?: return
        artworkFailedAt = 0L
        loadArtwork(uri, info.artworkHeaders)
    }

    /**
     * Call on every position tick. The session extrapolates the position from
     * the last published state, so this only republishes on a jump (seek,
     * stall) or when the duration becomes known.
     */
    fun onPositionTick() {
        if (mediaSession == null) return
        val position = (target.positionSeconds * 1000).toLong()
        if (target.isPlaying && position != progressMarkMs) {
            progressMarkMs = position
            if (wakeLock?.isHeld != true) acquireLocks() else armStallWatch()
        }
        val durationMs = (target.durationSeconds * 1000).toLong()
        if (durationMs > 0 && abs(durationMs - publishedDurationMs) > 1000) {
            updateMetadata()
        }
        val expected = publishedPositionMs +
            ((SystemClock.elapsedRealtime() - publishedAtRealtime) * publishedSpeed).toLong()
        val actual = (target.positionSeconds * 1000).toLong()
        if (abs(actual - expected) > POSITION_DRIFT_REPUBLISH_MS) updatePlaybackState()
    }

    fun updateMetadata() {
        val session = mediaSession ?: return
        val info = target.nowPlaying
        val durationMs = (target.durationSeconds * 1000).toLong().coerceAtLeast(0)
        publishedDurationMs = durationMs

        val artworkUri = info?.artworkUri
        if (artworkUri != artworkUriLoaded) {
            artworkUriLoaded = artworkUri
            artworkBitmap = null
            artworkFailedAt = 0L
            if (!artworkUri.isNullOrBlank()) loadArtwork(artworkUri, info.artworkHeaders)
        }

        session.setMetadata(buildMetadata(info, durationMs))
        PlaybackService.refresh(context, this)
    }

    private fun buildMetadata(info: NowPlayingInfo?, durationMs: Long): MediaMetadata {
        val builder = MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, info?.title ?: "Streamyfin")
            .putString(MediaMetadata.METADATA_KEY_ARTIST, info?.subtitle ?: "")
            .putString(MediaMetadata.METADATA_KEY_ALBUM, info?.album ?: info?.subtitle ?: "")
            .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
        artworkBitmap?.let {
            builder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, it)
            builder.putBitmap(MediaMetadata.METADATA_KEY_ART, it)
        }
        return builder.build()
    }

    private fun loadArtwork(uri: String, headers: Map<String, String>?) {
        try {
            artworkExecutor.execute {
                val bitmap = try {
                    decodeArtwork(uri, headers)
                } catch (e: Throwable) {
                    // OutOfMemoryError included: the artwork is never worth the process.
                    // Offline, an image the server does not have: the
                    // notification just goes without artwork.
                    Log.d(TAG, "Artwork unavailable: ${e.message}")
                    null
                }
                mainHandler.post {
                    if (released || artworkUriLoaded != uri) return@post
                    if (bitmap == null) {
                        artworkFailedAt = SystemClock.elapsedRealtime()
                        return@post
                    }
                    artworkFailedAt = 0L
                    artworkBitmap = bitmap
                    mediaSession?.setMetadata(buildMetadata(target.nowPlaying, publishedDurationMs))
                    PlaybackService.refresh(context, this)
                }
            }
        } catch (e: Exception) {
            // Executor already shut down by release().
        }
    }

    private fun decodeArtwork(uri: String, headers: Map<String, String>?): Bitmap? {
        val bytes: ByteArray = when {
            uri.startsWith("file://") || uri.startsWith("/") -> {
                val path = if (uri.startsWith("/")) uri else (Uri.parse(uri).path ?: return null)
                File(path).readBytes()
            }
            else -> {
                val conn = URL(uri).openConnection() as HttpURLConnection
                conn.connectTimeout = ARTWORK_TIMEOUT_MS
                conn.readTimeout = ARTWORK_TIMEOUT_MS
                headers?.forEach { (k, v) -> conn.setRequestProperty(k, v) }
                // A redirect would carry these headers to wherever it points,
                // past the origin check that chose them.
                if (!headers.isNullOrEmpty()) conn.instanceFollowRedirects = false
                try {
                    if (conn.responseCode !in 200..299) return null
                    if (conn.contentLengthLong > ARTWORK_MAX_BYTES) return null
                    conn.inputStream.use { input ->
                        val out = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(16 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            out.write(buffer, 0, read)
                            if (out.size() > ARTWORK_MAX_BYTES) return null
                        }
                        out.toByteArray()
                    }
                } finally {
                    conn.disconnect()
                }
            }
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        // By the longer side, so a very wide or tall image is scaled down too.
        val longest = maxOf(bounds.outWidth, bounds.outHeight)
        while (longest / (sample * 2) >= ARTWORK_MAX_PX) sample *= 2
        return BitmapFactory.decodeByteArray(
            bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }
        )
    }

    // MARK: - Notification (built for PlaybackService)

    internal fun buildNotification(service: Context): Notification {
        val info = target.nowPlaying
        val playing = target.isPlaying
        PlaybackService.ensureChannel(service)

        val builder = Notification.Builder(service, PlaybackService.CHANNEL_ID)
            .setSmallIcon(smallIconRes(service))
            .setContentTitle(info?.title ?: "Streamyfin")
            .setContentText(info?.subtitle ?: "")
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(playing)
        artworkBitmap?.let { builder.setLargeIcon(it) }
        launchPendingIntent()?.let { builder.setContentIntent(it) }

        // Android 13+ draws the controls from the session; these actions are
        // what older versions show.
        val canSeek = target.canSeek
        if (canSeek) {
            builder.addAction(action(service, android.R.drawable.ic_media_rew, "Rewind", PlaybackService.ACTION_REWIND))
        }
        if (playing) {
            builder.addAction(action(service, android.R.drawable.ic_media_pause, "Pause", PlaybackService.ACTION_PAUSE))
        } else {
            builder.addAction(action(service, android.R.drawable.ic_media_play, "Play", PlaybackService.ACTION_PLAY))
        }
        if (canSeek) {
            builder.addAction(action(service, android.R.drawable.ic_media_ff, "Fast forward", PlaybackService.ACTION_FORWARD))
        }

        val style = if (canSeek) {
            Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2)
        } else {
            Notification.MediaStyle().setShowActionsInCompactView(0)
        }
        mediaSession?.sessionToken?.let { style.setMediaSession(it) }
        builder.setStyle(style)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        }
        return builder.build()
    }

    /** A notification button press, delivered by PlaybackService. */
    internal fun handleAction(action: String?) {
        when (action) {
            PlaybackService.ACTION_PLAY -> target.play()
            PlaybackService.ACTION_PAUSE -> target.pause()
            PlaybackService.ACTION_REWIND -> if (target.canSeek) target.seekBy(-target.seekBackSeconds)
            PlaybackService.ACTION_FORWARD -> if (target.canSeek) target.seekBy(target.seekForwardSeconds)
        }
    }

    /** The user swiped the app away from recents. */
    internal fun onTaskRemoved() {
        target.onTaskRemoved()
    }

    private fun action(service: Context, icon: Int, title: String, action: String): Notification.Action {
        val intent = Intent(service, PlaybackService::class.java).setAction(action)
        val pending = PendingIntent.getService(
            service, action.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Action.Builder(Icon.createWithResource(service, icon), title, pending).build()
    }

    @SuppressLint("DiscouragedApi")
    private fun smallIconRes(ctx: Context): Int {
        val id = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
        return if (id != 0) id else android.R.drawable.ic_media_play
    }

    private fun launchPendingIntent(): PendingIntent? {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        // Same as tapping the launcher icon: bring the existing task (and the
        // player on top of it) to the front instead of starting over.
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        return PendingIntent.getActivity(
            context, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    // MARK: - Audio focus

    private fun onAudioFocusChange(change: Int) {
        if (released) return
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                Log.i(TAG, "Audio focus lost — pausing")
                hasAudioFocus = false
                target.pauseForInterruption()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                // A call or an assistant prompt. A Play pressed meanwhile
                // asks for the focus again instead of playing over it.
                Log.i(TAG, "Audio focus lost transiently — pausing")
                hasAudioFocus = false
                target.pauseForInterruption()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                isDucked = true
                target.duck(30)
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                hasAudioFocus = true
                if (isDucked) {
                    isDucked = false
                    target.duck(null)
                }
            }
        }
    }

    /** True when the focus is granted. */
    private fun requestAudioFocus(): Boolean {
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
            .build()
        val request = audioFocusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(attributes)
            .setAcceptsDelayedFocusGain(false)
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener(focusListener, mainHandler)
            .build()
            .also { audioFocusRequest = it }
        hasAudioFocus = audioManager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return hasAudioFocus
    }

    private fun abandonAudioFocus() {
        audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        hasAudioFocus = false
    }

    private fun registerNoisyReceiver() {
        if (noisyReceiverRegistered) return
        try {
            val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                context.registerReceiver(noisyReceiver, filter)
            }
            noisyReceiverRegistered = true
        } catch (e: Exception) {
            Log.w(TAG, "Could not register the noisy receiver: ${e.message}")
        }
    }

    private fun unregisterNoisyReceiver() {
        if (!noisyReceiverRegistered) return
        try {
            context.unregisterReceiver(noisyReceiver)
        } catch (e: Exception) {
            // Already gone.
        }
        noisyReceiverRegistered = false
    }

    // MARK: - Wake and Wi-Fi locks

    @SuppressLint("WakelockTimeout")
    private var progressMarkMs = -1L
    private var stallWatchArmed = false
    private val stalledRunnable = Runnable {
        stallWatchArmed = false
        if (released) return@Runnable
        Log.i(TAG, "No progress for ${LOCKS_WITHOUT_PROGRESS_MS / 60_000} min — releasing the playback locks")
        releaseLocks()
    }

    private fun armStallWatch() {
        mainHandler.removeCallbacks(stalledRunnable)
        mainHandler.postDelayed(stalledRunnable, LOCKS_WITHOUT_PROGRESS_MS)
        stallWatchArmed = true
    }

    private fun acquireLocks() {
        if (!stallWatchArmed) armStallWatch()
        try {
            val wl = wakeLock ?: (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "streamyfin:playback")
                .apply { setReferenceCounted(false) }
                .also { wakeLock = it }
            if (!wl.isHeld) wl.acquire()

            if (target.isNetworkSource) {
                val lock = wifiLock ?: createWifiLock()?.also { wifiLock = it }
                if (lock != null && !lock.isHeld) lock.acquire()
            } else {
                wifiLock?.takeIf { it.isHeld }?.release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire playback locks: ${e.message}")
        }
    }

    // HIGH_PERF, as Media3's WifiLockManager, before Android 14 only. From 14
    // on the platform hands out LOW_LATENCY for it, which only holds while the
    // screen is on and the app in front, the opposite of what this is for: no
    // lock is taken there, and the CPU wake lock is the protection left.
    @Suppress("DEPRECATION")
    internal fun createWifiLock(): WifiManager.WifiLock? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return null
        val wifi = context.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return null
        return wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "streamyfin:playback")
            .apply { setReferenceCounted(false) }
    }

    private fun releaseLocks() {
        mainHandler.removeCallbacks(stalledRunnable)
        stallWatchArmed = false
        try {
            wakeLock?.takeIf { it.isHeld }?.release()
            wifiLock?.takeIf { it.isHeld }?.release()
        } catch (e: Exception) {
            // Released already.
        }
    }
}
