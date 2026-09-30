@file:OptIn(androidx.media3.common.util.UnstableApi::class)

package expo.modules.mpvplayer.nativeplayer.engine

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.Surface
import android.view.SurfaceView
import android.view.View
import android.widget.FrameLayout
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ColorInfo
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.text.Cue
import androidx.media3.common.text.CueGroup
import androidx.media3.common.VideoSize
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.audio.AudioCapabilities
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.SubtitleView
import expo.modules.mpvplayer.DeviceKind
import expo.modules.mpvplayer.nativeplayer.MpvOwnership

/**
 * Media3/ExoPlayer implementation of [PlayerEngine] for the native chrome.
 *
 * The engine logic mirrors the JS-route ExoPlayerView (modules/exoplayer-player):
 * same Dolby passthrough probe, same mpv-cache→LoadControl mapping, same
 * 1-based-per-kind track id scheme, same side-loaded subtitle id stamping, and
 * the same mpv-matched 1.5x subtitle size baseline. Differences are the
 * hosting model: the session owns the SurfaceView (the engine resizes it for
 * zoom), subtitles render into the engine-owned [subtitleOverlay] stacked
 * between the video surface and the ComposeView, and callbacks drive the
 * shared [PlayerEngine.Delegate] instead of JS events.
 *
 * Threading: the chrome's module layer reads track lists and technical info
 * on a background HandlerThread, and some setters arrive off-main. Media3's
 * Player throws on off-looper access, so every player-touching method posts
 * to the main handler and the getters return main-thread-maintained
 * snapshots.
 */
class ExoPlayerEngine(private val context: Context) : PlayerEngine {

    companion object {
        private const val TAG = "ExoPlayerEngine"
        private const val PROGRESS_INTERVAL_MS = 1000L

        // Prefix stamped into Format.id of side-loaded subtitle tracks so
        // getSubtitleTracks() can report the source URL the JS resolver
        // matches against (mirrors mpv's external-filename field).
        private const val SIDELOAD_ID_PREFIX = "sideload:"
    }

    override var delegate: PlayerEngine.Delegate? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    /** Viewport size the session reports via [updateSurfaceSize]; drives the zoom layout. */
    private var viewportWidth = 0
    private var viewportHeight = 0

    /** The session's video surface; attached on player creation and surface (re)creation. */
    private var surfaceView: SurfaceView? = null

    private var player: ExoPlayer? = null

    /** Engine-owned subtitle layer stacked over the video surface, under the chrome. */
    override val subtitleOverlay: View = SubtitleView(context).apply {
        layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
        )
    }

    // Ownership token from MpvOwnership.claim — serializes with the mpv
    // engines so a chrome and an embedded view can never run at once.
    @Volatile private var pendingOwnershipToken: Any? = null
    @Volatile private var activeOwnershipToken: Any? = null
    @Volatile private var isRunning = false

    /** Retained across player re-creation; see setMute. */
    private var isMuted = false
    private var volumeBoostPercent = 100

    /** Set by recovery callers so the post-reload state follows the play intent. */
    @Volatile override var playbackResumeIntent: Boolean = false

    private var currentUrl: String? = null
    private var currentHeaders: Map<String, String>? = null
    private var currentLoop: Boolean = false
    private var currentExternalSubtitles: List<String> = emptyList()
    private var pendingConfig: VideoLoadConfig? = null
    private var tracksReadyFired: Boolean = false

    // Resume position handed to setMediaSource() on load. seekTo() uses it to
    // drop the redundant re-seek the JS layer fires once tracks are ready.
    private var loadStartPositionMs: Long = 0L

    // Side-loaded subtitle configurations accumulated across load and
    // addSubtitleFile. Media3 doesn't expose the live SubtitleConfiguration
    // list on a playing MediaItem, so it is shadowed here.
    private var sideLoadedSubs: List<MediaItem.SubtitleConfiguration> = emptyList()

    // 1-based track ID mappings (matching MPV's contract), rebuilt on
    // onTracksChanged. Also cached in bridge-map form for the module layer's
    // off-main reads.
    private var subtitleTrackList: List<TrackEntry> = emptyList()
    private var audioTrackList: List<TrackEntry> = emptyList()

    // Written on main (setters + Player.Listener); read off-main by the
    // module layer's getCurrent*Track from the props HandlerThread.
    @Volatile private var currentSubtitleId: Int = 0
    @Volatile private var currentAudioId: Int = 0

    @Volatile private var cachedSubtitleTracks: List<Map<String, Any>> = emptyList()
    @Volatile private var cachedAudioTracks: List<Map<String, Any>> = emptyList()

    // Subtitle styling state — applied to the engine-owned SubtitleView.
    private var subtitleScale: Float = 1f
    private var subtitleFontSizePct: Int? = null // 0-100
    private var subtitleBottomFraction: Float? = null
    private var subtitleAlignY: String = "bottom"
    private var subtitleBackgroundColor: Int = Color.argb(0, 0, 0, 0)
    private var currentSubtitleCues: List<Cue> = emptyList()
    private var subtitleForegroundColor: Int = Color.WHITE
    private var subtitleTypeface: Typeface = Typeface.SANS_SERIF
    private var subtitleBorderStyle: String = "outline-and-shadow"

    private var isZoomedToFill: Boolean = false
    private var currentVideoAspectRatio: Float? = null

    // Captured by analyticsListener; surfaced via getTechnicalInfo().
    private var videoDecoderName: String? = null
    private var audioDecoderName: String? = null
    private var cumulativeDroppedFrames: Int = 0

    // Selected video/audio codec at the last onTracksChanged; see the
    // decoder-name clearing in playerListener.onTracksChanged.
    private var lastVideoDecoderKey: String? = null
    private var lastAudioDecoderKey: String? = null

    // Main-thread snapshots for the engine getters (the module layer reads
    // them from the props HandlerThread).
    @Volatile private var cachedPositionSec: Double = 0.0
    @Volatile private var cachedDurationSec: Double = 0.0
    @Volatile private var cachedCacheSeconds: Double = 0.0
    @Volatile private var cachedPlayWhenReady: Boolean = false
    @Volatile private var cachedVideoWidth: Int = 0
    @Volatile private var cachedVideoHeight: Int = 0
    @Volatile private var latestTechnicalInfo: Map<String, Any> = emptyMap()

    override val isTv: Boolean = DeviceKind.isTelevision(context)

    // MARK: - Ownership / lifecycle

    override fun start(owner: PlayerEngine.Owner, onStarted: () -> Unit) {
        if (isRunning || pendingOwnershipToken != null) return
        val mpvOwner = when (owner) {
            PlayerEngine.Owner.EMBEDDED_VIEW -> MpvOwnership.Owner.EMBEDDED_VIEW
            PlayerEngine.Owner.NATIVE_SESSION -> MpvOwnership.Owner.NATIVE_SESSION
        }
        val ownershipToken = Any()
        pendingOwnershipToken = ownershipToken

        MpvOwnership.claim(mpvOwner, ownershipToken) {
            val startAction = Runnable {
                if (pendingOwnershipToken !== ownershipToken) {
                    MpvOwnership.release(ownershipToken)
                    return@Runnable
                }
                pendingOwnershipToken = null
                activeOwnershipToken = ownershipToken
                isRunning = true
                Log.i(TAG, "ExoPlayer engine started (owner=$owner)")
                onStarted()
            }
            if (Looper.myLooper() == Looper.getMainLooper()) {
                startAction.run()
            } else {
                mainHandler.post(startAction)
            }
        }
    }

    override fun stop() {
        val pendingToken = pendingOwnershipToken
        val activeToken = activeOwnershipToken
        if (!isRunning && pendingToken == null && activeToken == null) return

        pendingOwnershipToken = null
        pendingToken?.let(MpvOwnership::cancel)
        activeOwnershipToken = null
        isRunning = false

        stopProgressLoop()
        mainHandler.post {
            player?.release()
            player = null
            activeToken?.let(MpvOwnership::release)
        }
    }

    // MARK: - Surface

    override fun attachSurfaceView(surfaceView: SurfaceView) {
        this.surfaceView = surfaceView
        // Media3 attaches through setVideoSurfaceView; a player created later
        // picks the stored view up in ensurePlayer().
        player?.setVideoSurfaceView(surfaceView)
        updateVideoSurfaceLayout()
    }

    /**
     * Deliberately a no-op: with setVideoSurfaceView Media3 manages the
     * holder callback lifecycle itself (re-attaches on surfaceCreated), so
     * mpv's keep-the-VO-alive dance does not apply.
     */
    override fun detachSurface() {}

    override fun updateSurfaceSize(width: Int, height: Int) {
        viewportWidth = width
        viewportHeight = height
        updateVideoSurfaceLayout()
    }

    // MARK: - Loading

    override fun load(config: VideoLoadConfig) = load(config, force = false)

    private fun load(config: VideoLoadConfig, force: Boolean) {
        // Same-URL guard, mirroring the JS-route view: a redundant load of the
        // running stream (e.g. a replayed startStream) is skipped. Quality and
        // track re-negotiations always change the URL. Recovery callers must
        // pass force=true — they reload the SAME url/loop on purpose, and the
        // guard would silently no-op them (the player is still non-null after
        // an error; STATE_IDLE just means the pipeline needs prepare() again).
        if (!force && currentUrl == config.url && currentLoop == config.loop && player != null) {
            return
        }

        currentUrl = config.url
        currentHeaders = config.headers
        currentLoop = config.loop
        currentExternalSubtitles = config.externalSubtitles ?: emptyList()
        pendingConfig = config
        // The chrome coordinator re-applies carried subtitle selections on
        // every onTracksReady (mpv fires per FILE_LOADED), so the flag must
        // reset per load — unlike the JS-route view, which fires once per view.
        tracksReadyFired = false
        cachedVideoWidth = 0
        cachedVideoHeight = 0
        currentVideoAspectRatio = null

        delegate?.onLoadingChanged(true)

        ensurePlayer(config)
        loadInternal(config)
    }

    private fun buildLoadControl(config: VideoLoadConfig): DefaultLoadControl {
        // Map MPV-style cache config to ExoPlayer's LoadControl.
        val cacheEnabled = when (config.cacheEnabled) {
            "no" -> false
            "yes" -> true
            else -> true // "auto"
        }

        // Buffer thresholds used as fallbacks when the user's cache config
        // doesn't override them. Media3's own defaults changed in 1.6.0
        // (bufferForPlaybackMs 2500→1000, afterRebuffer 5000→2000) for a
        // faster start; the older 2500/5000 values are kept because low-RAM
        // Android TVs with slow tuners benefit from the extra headroom.
        // Media3's DEFAULT_* IntDef fields are private, hence the literals.
        val defaultMinBufferMs = 15000
        val defaultBufferForPlaybackMs = 2500
        val defaultBufferForPlaybackAfterRebufferMs = 5000

        val targetBufferMs = if (!cacheEnabled) {
            50000
        } else {
            val seconds = config.cacheSeconds?.coerceIn(5, 120) ?: 10
            seconds * 1000
        }
        val backBufferMs = if (!cacheEnabled) {
            0
        } else {
            val mb = config.demuxerMaxBackBytes ?: 50
            // Heuristic: 1 MB ≈ 1s of typical 1080p bitrate.
            (mb * 1000).coerceAtLeast(1000)
        }

        // DefaultLoadControl's builder validates maxBufferMs >= minBufferMs
        // (and minBufferMs >= both start thresholds) and throws otherwise.
        // The user's cacheSeconds can be as low as 5s — below the 15s default
        // min — so derive the min from the same target.
        val minBufferMs = minOf(defaultMinBufferMs, targetBufferMs)
            .coerceAtLeast(defaultBufferForPlaybackAfterRebufferMs)

        // demuxerMaxBytes is in MiB; multiplying in Int overflows at 2048 MiB.
        // Convert in Long and clamp; non-positive values fall back to the
        // positive default.
        val mb = config.demuxerMaxBytes?.takeIf { it > 0 } ?: 150
        val targetBufferBytes =
            if (!cacheEnabled) C.LENGTH_UNSET
            else (mb.toLong() * 1024 * 1024)
                .coerceAtMost(Int.MAX_VALUE.toLong())
                .toInt()

        val builder = DefaultLoadControl.Builder()
            // C.LENGTH_UNSET lets ExoPlayer auto-derive the byte target from
            // the selected tracks. A literal 0 makes targetBufferSizeReached
            // true on the first allocation, starving playback.
            .setTargetBufferBytes(targetBufferBytes)
            .setBufferDurationsMs(
                /* minBufferMs = */ minBufferMs,
                /* maxBufferMs = */ targetBufferMs,
                /* bufferForPlaybackMs = */ defaultBufferForPlaybackMs,
                /* bufferForPlaybackAfterRebufferMs = */ defaultBufferForPlaybackAfterRebufferMs,
            )
        if (cacheEnabled) {
            builder.setBackBuffer(backBufferMs, /* retainBackBufferFromKeyframe = */ true)
        }
        return builder.build()
    }

    private fun ensurePlayer(config: VideoLoadConfig) {
        if (player != null) return

        val loadControl = buildLoadControl(config)

        // Bitstream (passthrough) capable sinks change the renderer ordering:
        // on E-AC-3/JOC-capable output, MediaCodecAudioRenderer hands the
        // untouched bitstream to AudioTrack — the only path that preserves
        // Atmos. On PCM-only output, PREFER lets the FFmpeg decoder take over
        // formats MediaCodec has no hardware decoder for.
        val audioCaps = AudioCapabilities.getCapabilities(context)
        val bitstreamCapable =
            audioCaps.supportsEncoding(C.ENCODING_E_AC3_JOC) ||
                audioCaps.supportsEncoding(C.ENCODING_AC3) ||
                audioCaps.supportsEncoding(C.ENCODING_E_AC3)
        Log.i(
            TAG,
            "Audio output bitstream-capable=$bitstreamCapable " +
                "(JOC=${audioCaps.supportsEncoding(C.ENCODING_E_AC3_JOC)}, " +
                "EAC3=${audioCaps.supportsEncoding(C.ENCODING_E_AC3)}, " +
                "AC3=${audioCaps.supportsEncoding(C.ENCODING_AC3)})",
        )
        val renderersFactory = DefaultRenderersFactory(context)
            .setExtensionRendererMode(
                if (bitstreamCapable) {
                    DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON
                } else {
                    DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER
                }
            )
            .setEnableDecoderFallback(true)

        val exo = ExoPlayer.Builder(context, renderersFactory)
            .setLoadControl(loadControl)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                // MediaSessionController owns audio focus + ducking for the
                // chrome; a second owner here would double-pause on focus loss.
                /* handleAudioFocus = */ false,
            )
            .build()

        exo.addListener(playerListener)
        exo.addAnalyticsListener(analyticsListener)
        exo.repeatMode = Player.REPEAT_MODE_OFF
        exo.videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT
        // Re-apply the retained mute flag: a fresh ExoPlayer always starts at
        // full volume, which would contradict the state the session still holds.
        exo.volume = effectiveVolume()
        surfaceView?.let { exo.setVideoSurfaceView(it) }
        player = exo

        applySubtitleStyle()
    }

    private fun loadInternal(config: VideoLoadConfig) {
        val p = player ?: return

        val httpFactory = DefaultHttpDataSource.Factory()
            .setDefaultRequestProperties(config.headers ?: emptyMap())
        val dataSourceFactory = DefaultDataSource.Factory(context, httpFactory)

        val mediaItem = buildMediaItem(config)
        val mediaSource = DefaultMediaSourceFactory(dataSourceFactory)
            .createMediaSource(mediaItem)

        // Prepare from the resume position directly — calling prepare() first
        // and seeking afterwards replays the opening seconds (C.TIME_UNSET
        // falls back to the media's default start position).
        val startMs = config.startPosition?.let { sp ->
            if (sp > 0) (sp * 1000).toLong() else C.TIME_UNSET
        } ?: C.TIME_UNSET
        loadStartPositionMs = if (startMs != C.TIME_UNSET) startMs else 0L

        p.setMediaSource(mediaSource, startMs)
        p.prepare()
        // Autoplay is driven by the session (it calls play() exactly like it
        // does for mpv), so the engine stays load-only here.

        startProgressLoop()
    }

    private fun buildMediaItem(config: VideoLoadConfig): MediaItem {
        val builder = MediaItem.Builder().setUri(config.url)

        // External subtitles: side-loaded SubtitleConfigurations, MIME sniffed
        // from the extension, URL stamped into the config id so it reaches
        // Format.id in the track list (the JS resolver matches by that URL).
        val subs = config.externalSubtitles
        if (!subs.isNullOrEmpty()) {
            val subtitleConfigs = subs.mapNotNull { subUrl ->
                val mime = mimeTypeForSubtitleUrl(subUrl) ?: return@mapNotNull null
                MediaItem.SubtitleConfiguration.Builder(Uri.parse(subUrl))
                    .setMimeType(mime)
                    .setId(SIDELOAD_ID_PREFIX + subUrl)
                    .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                    .build()
            }
            sideLoadedSubs = subtitleConfigs
            builder.setSubtitleConfigurations(subtitleConfigs)
        } else {
            sideLoadedSubs = emptyList()
        }

        return builder.build()
    }

    private fun mimeTypeForSubtitleUrl(url: String): String? {
        val lower = url.substringBeforeLast('?').lowercase()
        return when {
            lower.endsWith(".vtt") || lower.endsWith(".webvtt") -> "text/vtt"
            lower.endsWith(".srt") -> "application/x-subrip"
            lower.endsWith(".ssa") || lower.endsWith(".ass") -> "text/x-ssa"
            lower.endsWith(".ttml") || lower.endsWith(".xml") -> "application/ttml+xml"
            else -> null
        }
    }

    // MARK: - Transport

    override fun play() = post { player?.play() }

    override fun pause() = post { player?.pause() }

    override fun togglePause() = post {
        player?.let { it.playWhenReady = !it.playWhenReady }
    }

    override fun seekTo(seconds: Double) = post {
        val p = player ?: return@post
        val targetMs = (seconds * 1000).toLong()
        // Drop the redundant initial seek that mirrors the resume position we
        // already applied via setMediaSource(). Only the first seek after load
        // is eligible, so a genuine seek to ~the start later still works.
        if (loadStartPositionMs > 0 && Math.abs(targetMs - loadStartPositionMs) < 1000L) {
            loadStartPositionMs = 0L
            return@post
        }
        loadStartPositionMs = 0L
        p.seekTo(targetMs)
    }

    override fun seekBy(seconds: Double) = post {
        val p = player ?: return@post
        val target = (p.currentPosition + seconds * 1000).coerceAtLeast(0.0)
        p.seekTo(target.toLong())
    }

    override fun setSpeed(speed: Double) = post {
        player?.playbackParameters = PlaybackParameters(speed.toFloat())
    }

    override fun getSpeed(): Double {
        // playbackParameters is not safe to read off-main; 1.0 is the only
        // value the chrome ever needs back (speed lives in the view model).
        return 1.0
    }

    /**
     * Engine mute; the device volume is left untouched. Retained across
     * player re-creation so the next stream comes back muted.
     */
    override fun setMute(muted: Boolean) {
        isMuted = muted
        post { player?.volume = effectiveVolume() }
    }

    /** Volume boost maps onto the player volume (mpv has volume-max; Media3 has 0..1). */
    override fun setVolumeBoost(percent: Int) {
        volumeBoostPercent = percent
        post { player?.volume = effectiveVolume() }
    }

    private fun effectiveVolume(): Float =
        if (isMuted) 0f else (volumeBoostPercent / 100f).coerceIn(0f, 1f)

    override fun getChapters(): List<Map<String, Any>> = emptyList()

    override fun reloadCurrentItem() {
        val url = currentUrl ?: return
        load(
            VideoLoadConfig(
                url = url,
                headers = currentHeaders,
                startPosition = cachedPositionSec,
                initialAudioId = currentAudioId,
                initialSubtitleId = currentSubtitleId,
                loop = currentLoop,
                externalSubtitles = currentExternalSubtitles,
            ),
            force = true,
        )
    }

    // MARK: - Resume recovery

    override fun isVideoOutputBroken(): Boolean {
        val p = player ?: return false
        return p.playbackState == Player.STATE_IDLE || p.playerError != null
    }

    override fun recoverVideoOutput(surface: Surface?) {
        val url = currentUrl ?: return
        // Media3 re-binds a recreated surface by itself in most cases; this
        // reload is the same cheap insurance the mpv engine runs.
        surfaceView?.let { player?.setVideoSurfaceView(it) }
        load(
            VideoLoadConfig(
                url = url,
                headers = currentHeaders,
                startPosition = cachedPositionSec,
                initialAudioId = currentAudioId,
                initialSubtitleId = currentSubtitleId,
                loop = currentLoop,
                externalSubtitles = currentExternalSubtitles,
            ),
            force = true,
        )
        if (playbackResumeIntent) play() else pause()
    }

    // MARK: - Tracks (bridge id scheme)

    private data class TrackEntry(
        val id: Int,          // 1-based JS-facing ID
        val trackGroupIndex: Int,
        val trackIndex: Int,
        val format: Format,
    )

    override fun getSubtitleTracks(): List<Map<String, Any>> = cachedSubtitleTracks

    override fun setSubtitleTrack(trackId: Int) = post {
        val p = player ?: return@post
        val entry = subtitleTrackList.firstOrNull { it.id == trackId } ?: return@post
        // trackGroupIndex is from the last onTracksChanged snapshot; a
        // MediaItem rebuild can shift/shrink the groups array before the next
        // onTracksChanged refreshes it — guard rather than crash.
        val matchedGroup =
            p.currentTracks.groups.getOrNull(entry.trackGroupIndex)?.mediaTrackGroup ?: return@post

        val params = p.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            .setOverrideForType(TrackSelectionOverride(matchedGroup, entry.trackIndex))
            .build()
        p.trackSelectionParameters = params
        currentSubtitleId = trackId
    }

    override fun disableSubtitles() = post {
        val p = player ?: return@post
        val params = p.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .build()
        p.trackSelectionParameters = params
        currentSubtitleId = 0
    }

    override fun getCurrentSubtitleTrack(): Int = currentSubtitleId

    override fun addSubtitleFile(url: String, select: Boolean) = post {
        val p = player ?: return@post
        val mime = mimeTypeForSubtitleUrl(url) ?: return@post
        val currentMediaItem = p.currentMediaItem ?: return@post
        val newSubConfig = MediaItem.SubtitleConfiguration.Builder(Uri.parse(url))
            .setMimeType(mime)
            .setId(SIDELOAD_ID_PREFIX + url)
            .setSelectionFlags(if (select) C.SELECTION_FLAG_DEFAULT else 0)
            .build()

        // Rebuild with the full accumulated list so previously side-loaded
        // subs survive.
        val combined = sideLoadedSubs + newSubConfig
        sideLoadedSubs = combined
        currentExternalSubtitles = combined.map { it.uri.toString() }

        val rebuilt = currentMediaItem.buildUpon()
            .setSubtitleConfigurations(combined)
            .build()

        val wasPlaying = p.isPlaying
        val pos = p.currentPosition
        p.setMediaItem(rebuilt, pos)
        p.prepare()
        if (wasPlaying) p.play()

        // Clear any text override so a selecting add's SELECTION_FLAG_DEFAULT
        // sub is the one that renders (a prior override would win).
        if (select) {
            val params = p.trackSelectionParameters.buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                .clearOverridesOfType(C.TRACK_TYPE_TEXT)
                .build()
            p.trackSelectionParameters = params
        }
    }

    override fun getAudioTracks(): List<Map<String, Any>> = cachedAudioTracks

    override fun setAudioTrack(trackId: Int) = post {
        val p = player ?: return@post
        val entry = audioTrackList.firstOrNull { it.id == trackId } ?: return@post
        val matchedGroup =
            p.currentTracks.groups.getOrNull(entry.trackGroupIndex)?.mediaTrackGroup ?: return@post

        val params = p.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
            .setOverrideForType(TrackSelectionOverride(matchedGroup, entry.trackIndex))
            .build()
        p.trackSelectionParameters = params
        currentAudioId = trackId
    }

    override fun getCurrentAudioTrack(): Int = currentAudioId

    private fun rebuildTrackMaps(tracks: Tracks?) {
        if (tracks == null) return

        val subtitles = mutableListOf<TrackEntry>()
        val audios = mutableListOf<TrackEntry>()

        tracks.groups.forEachIndexed { groupIndex, group ->
            for (trackIdx in 0 until group.length) {
                if (!group.isTrackSupported(trackIdx)) continue
                val format = group.getTrackFormat(trackIdx)
                val entry = TrackEntry(
                    id = 0, // assigned per-list below
                    trackGroupIndex = groupIndex,
                    trackIndex = trackIdx,
                    format = format,
                )
                when (group.type) {
                    C.TRACK_TYPE_TEXT -> subtitles.add(entry)
                    C.TRACK_TYPE_AUDIO -> audios.add(entry)
                    else -> { /* video / metadata ignored */ }
                }
            }
        }

        subtitles.forEachIndexed { i, e -> subtitles[i] = e.copy(id = i + 1) }
        audios.forEachIndexed { i, e -> audios[i] = e.copy(id = i + 1) }

        subtitleTrackList = subtitles
        audioTrackList = audios
        cachedSubtitleTracks = subtitles.map { entry ->
            val map = mutableMapOf<String, Any>(
                "id" to entry.id,
                "title" to (entry.format.label ?: ""),
                "lang" to (entry.format.language ?: ""),
            )
            // Mirror mpv's external / externalFilename fields for side-loaded
            // tracks. Media3's MergingMediaPeriod prefixes every merged
            // Format.id with its child source index — strip that first.
            val formatId = stripMergingSourcePrefix(entry.format.id)
            if (formatId?.startsWith(SIDELOAD_ID_PREFIX) == true) {
                map["external"] = true
                map["externalFilename"] = formatId.removePrefix(SIDELOAD_ID_PREFIX)
            }
            map
        }
        cachedAudioTracks = audios.map { entry ->
            val channels = if (entry.format.channelCount == Format.NO_VALUE) 0
            else entry.format.channelCount
            mapOf(
                "id" to entry.id,
                "title" to (entry.format.label ?: ""),
                "lang" to (entry.format.language ?: ""),
                "codec" to (entry.format.sampleMimeType ?: ""),
                "channels" to channels,
            )
        }
    }

    private fun stripMergingSourcePrefix(id: String?): String? {
        if (id == null) return null
        val colon = id.indexOf(':')
        return if (colon > 0 && id.substring(0, colon).all { it.isDigit() }) {
            id.substring(colon + 1)
        } else {
            id
        }
    }

    private fun syncCurrentSubtitleIdFromSelection(tracks: Tracks) {
        val groups = tracks.groups
        val selected = subtitleTrackList.firstOrNull { entry ->
            groups.getOrNull(entry.trackGroupIndex)?.isTrackSelected(entry.trackIndex) == true
        }
        currentSubtitleId = selected?.id ?: 0
    }

    private fun applyInitialTrackSelections() {
        val cfg = pendingConfig ?: return

        if (cfg.initialAudioId != null && cfg.initialAudioId > 0) {
            setAudioTrack(cfg.initialAudioId)
        }
        // Only disable text when JS asked for no subtitle (id 0) or passed an
        // explicit id. When absent, JS defers selection to onTracksReady and
        // resolves by URL identity via getSubtitleTracks().
        val initialSub = cfg.initialSubtitleId
        if (initialSub != null) {
            if (initialSub <= 0) disableSubtitles() else setSubtitleTrack(initialSub)
        }

        // Only apply once per source load.
        pendingConfig = null
    }

    // MARK: - Subtitle rendering (engine-owned SubtitleView)

    override fun setSubtitlePosition(position: Int) {
        // 0-100 (mpv convention: 100 = bottom). Map to the bottom-padding
        // fraction; reserve a small margin so 100 doesn't hug the edge.
        val clamped = position.coerceIn(0, 100)
        subtitleBottomFraction = 0.95f - (clamped / 100f) * 0.87f
        applySubtitleStyle()
    }

    override fun setSubtitleScale(scale: Double) {
        subtitleScale = scale.toFloat()
        applySubtitleStyle()
    }

    override fun setSubtitleMarginY(margin: Int) {
        // Margin in px; SubtitleView only accepts a single bottom-padding
        // fraction — heuristic conversion, last-write-wins vs position.
        val fraction = (margin / 1000f).coerceIn(0.02f, 0.95f)
        subtitleBottomFraction = fraction
        applySubtitleStyle()
    }

    override fun setSubtitleUseMargins(enabled: Boolean) {
        // mpv-only concept; vertical position is already a plain fraction here.
    }

    override fun setSubtitleScaleWithWindow(enabled: Boolean) {
        // mpv-only concept; scale is viewport-fraction based already.
    }

    override fun setSubtitleAlignX(alignment: String) {
        // Media3 cues follow their authored alignment; no override exists.
    }

    override fun setSubtitleAlignY(alignment: String) {
        subtitleAlignY = alignment
        if (alignment != "bottom") {
            subtitleBottomFraction = null
        }
        applySubtitleStyle()
    }

    override fun setSubtitleStyle(config: Map<String, Any>) {
        // The chrome sends the same map mpv's setSubtitleStyle gets:
        // { color?, font?, background?, backgroundPadding? }.
        (config["color"] as? String)?.let {
            subtitleForegroundColor = parseColor(it, subtitleForegroundColor)
        }
        (config["font"] as? String)?.let { font ->
            subtitleTypeface = when (font) {
                "System", "sans-serif" -> Typeface.SANS_SERIF
                "serif" -> Typeface.SERIF
                "monospace" -> Typeface.MONOSPACE
                "opendyslexic" -> loadOpenDyslexicTypeface()
                else -> Typeface.SANS_SERIF
            }
        }
        (config["background"] as? String)?.let { bg ->
            subtitleBackgroundColor = parseColor(bg, Color.argb(0, 0, 0, 0))
            // Mirror the JS wrapper: a visible background switches to the
            // padded box style, anything else back to outline-and-shadow.
            subtitleBorderStyle =
                if (Color.alpha(subtitleBackgroundColor) > 0) "background-box"
                else "outline-and-shadow"
        }
        // backgroundPadding has no SubtitleView equivalent (the window box has
        // no padding control) — accepted and ignored.
        applySubtitleStyle()
    }

    override fun setSubtitleFontSize(size: Int) {
        subtitleFontSizePct = size
        applySubtitleStyle()
    }

    override fun setSubtitleBorderStyle(style: String) {
        subtitleBorderStyle = style
        applySubtitleStyle()
    }

    override fun setSubtitleBackgroundColor(color: String) {
        subtitleBackgroundColor = parseColor(color, subtitleBackgroundColor)
        applySubtitleStyle()
    }

    override fun setSubtitleAssOverride(mode: String) {
        // libass-specific; Media3 has no equivalent (same no-op as the JS route).
    }

    override fun setSubtitleDelay(seconds: Double) {
        // mpv-only; Media3 subtitle offsets would need a custom TimeBar/
        // MediaPeriod shift — not wired for the chrome (JS route matches).
    }

    override fun setAudioDelay(seconds: Double) {
        // mpv-only.
    }

    override fun setDialogueBoost(enabled: Boolean) {
        // mpv-only (lavfi equalizer chain).
    }

    override fun setMonoDownmix(enabled: Boolean) {
        // mpv-only (audio-channels).
    }

    private fun loadOpenDyslexicTypeface(): Typeface {
        return try {
            Typeface.createFromAsset(context.assets, "fonts/OpenDyslexic-Regular.otf")
        } catch (error: Exception) {
            Log.w(TAG, "Failed to load OpenDyslexic font: ${error.message}")
            Typeface.SANS_SERIF
        }
    }

    private fun parseColor(hex: String, fallback: Int): Int {
        return try {
            when {
                hex.startsWith("#") && hex.length == 9 -> {
                    // #RRGGBBAA
                    val r = hex.substring(1, 3).toInt(16)
                    val g = hex.substring(3, 5).toInt(16)
                    val b = hex.substring(5, 7).toInt(16)
                    val a = hex.substring(7, 9).toInt(16)
                    Color.argb(a, r, g, b)
                }
                hex.startsWith("#") && hex.length == 7 -> Color.parseColor(hex)
                else -> fallback
            }
        } catch (_: Exception) {
            fallback
        }
    }

    private fun applySubtitleStyle() {
        val sv = subtitleOverlay as? SubtitleView ?: return

        // Text size: explicit % wins; otherwise scale the default. The base
        // matches MPV's look (mpv renders at sub-font-size 55 on libass's
        // 720-normalized canvas ≈ 7.6% of frame height vs Media3's 5.33%).
        val mpvMatchedBaseFraction = SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * 1.5f
        val textSizeFraction = if (subtitleFontSizePct != null) {
            (subtitleFontSizePct!! / 100f) * mpvMatchedBaseFraction
        } else {
            mpvMatchedBaseFraction * subtitleScale
        }
        sv.setFractionalTextSize(textSizeFraction)

        // Vertical position: explicit fraction wins; otherwise alignY mapping.
        val alignYFraction = when (subtitleAlignY) {
            "top" -> 0.9f
            "center" -> 0.5f
            else -> 0.08f // bottom
        }
        val bottomFraction = subtitleBottomFraction ?: alignYFraction
        sv.setBottomPaddingFraction(bottomFraction.coerceIn(0.02f, 0.95f))

        val foreground = subtitleForegroundColor
        val edgeType: Int
        val backgroundColor: Int
        when (subtitleBorderStyle) {
            "background-box" -> {
                edgeType = CaptionStyleCompat.EDGE_TYPE_NONE
                backgroundColor = Color.TRANSPARENT
            }
            else -> {
                edgeType = if (subtitleAlignY == "center")
                    CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW
                else
                    CaptionStyleCompat.EDGE_TYPE_OUTLINE
                backgroundColor = Color.TRANSPARENT
            }
        }

        val style = CaptionStyleCompat(
            foreground,
            backgroundColor,
            Color.TRANSPARENT,
            edgeType,
            Color.BLACK,
            subtitleTypeface,
        )
        sv.setApplyEmbeddedStyles(true)
        sv.setApplyEmbeddedFontSizes(false)
        sv.setStyle(style)
        applySubtitleCues()
    }

    private fun applySubtitleCues() {
        val sv = subtitleOverlay as? SubtitleView ?: return
        val useBackground =
            subtitleBorderStyle == "background-box" && Color.alpha(subtitleBackgroundColor) > 0

        val windowColor = if (useBackground) subtitleBackgroundColor else Color.TRANSPARENT
        val styledCues = currentSubtitleCues.map { cue ->
            val cueText = cue.text ?: return@map cue
            cue.buildUpon()
                .setWindowColor(windowColor)
                .setText(cueText.toString())
                .build()
        }

        sv.setCues(styledCues)
    }

    // MARK: - Video scaling

    override fun setZoomedToFill(zoomed: Boolean) {
        isZoomedToFill = zoomed
        updateVideoSurfaceLayout()
    }

    /** Sizes the session's SurfaceView for fit/zoom from the viewport dims. */
    private fun updateVideoSurfaceLayout() {
        val surface = surfaceView ?: return
        val aspectRatio = currentVideoAspectRatio ?: return
        val viewWidth = viewportWidth
        val viewHeight = viewportHeight
        if (viewWidth <= 0 || viewHeight <= 0 || !aspectRatio.isFinite()) return

        val viewAspectRatio = viewWidth.toFloat() / viewHeight

        val surfaceWidth: Int
        val surfaceHeight: Int
        if (isZoomedToFill) {
            // Zoom: fill the constraining dimension, crop the overflow.
            if (aspectRatio > viewAspectRatio) {
                surfaceHeight = viewHeight
                surfaceWidth = (viewHeight * aspectRatio).toInt()
            } else {
                surfaceWidth = viewWidth
                surfaceHeight = (viewWidth / aspectRatio).toInt()
            }
        } else {
            // Fit: match the constraining dimension, letterbox the rest.
            if (aspectRatio > viewAspectRatio) {
                surfaceWidth = viewWidth
                surfaceHeight = (viewWidth / aspectRatio).toInt()
            } else {
                surfaceHeight = viewHeight
                surfaceWidth = (viewHeight * aspectRatio).toInt()
            }
        }

        val lp = surface.layoutParams
        if (
            lp is FrameLayout.LayoutParams &&
            lp.width == surfaceWidth &&
            lp.height == surfaceHeight &&
            lp.gravity == Gravity.CENTER
        ) {
            return
        }
        surface.layoutParams = FrameLayout.LayoutParams(surfaceWidth, surfaceHeight).apply {
            gravity = Gravity.CENTER
        }
    }

    // MARK: - Technical info

    override fun getTechnicalInfo(): Map<String, Any> = latestTechnicalInfo

    private fun refreshTechnicalInfo() {
        val p = player ?: return
        val tracks = p.currentTracks

        // Prefer the currently-selected track within each renderer group;
        // fall back to the first supported track if none is selected yet.
        val videoFormat = pickFormat(tracks, C.TRACK_TYPE_VIDEO)
        val audioFormat = pickFormat(tracks, C.TRACK_TYPE_AUDIO)

        val cacheSec = if (p.bufferedPosition > p.currentPosition) {
            (p.bufferedPosition - p.currentPosition) / 1000.0
        } else 0.0

        val info = LinkedHashMap<String, Any>()
        info["cacheSeconds"] = cacheSec

        if (cumulativeDroppedFrames > 0) {
            info["droppedFrames"] = cumulativeDroppedFrames
        }

        // For ExoPlayer this replaces MPV's voDriver/hwdec pairing. The FFmpeg
        // extension reports names beginning with "FFmpeg" (software); anything
        // else is MediaCodec (hardware).
        videoDecoderName?.let { name ->
            info["decoderName"] = name
            info["decoderType"] = if (name.lowercase().startsWith("ffmpeg")) {
                "software"
            } else {
                "hardware"
            }
        }

        videoFormat?.let { f ->
            if (f.width != Format.NO_VALUE) info["videoWidth"] = f.width
            if (f.height != Format.NO_VALUE) info["videoHeight"] = f.height
            f.sampleMimeType?.let { info["videoCodec"] = it }
            if (f.frameRate > 0f) {
                info["fps"] = f.frameRate.toDouble()
            }
            val vBitrate = if (f.averageBitrate != Format.NO_VALUE) {
                f.averageBitrate
            } else {
                f.peakBitrate
            }
            if (vBitrate != Format.NO_VALUE && vBitrate > 0) {
                info["videoBitrate"] = vBitrate.toDouble()
            }
            f.codecs?.let { info["videoCodecs"] = it }

            f.colorInfo?.let { ci ->
                deriveHdrFormat(ci)?.let { info["hdrFormat"] = it }
                colorSpaceName(ci.colorSpace)?.let { info["colorSpace"] = it }
                colorRangeName(ci.colorRange)?.let { info["colorRange"] = it }
                colorTransferName(ci.colorTransfer)?.let { info["colorTransfer"] = it }
            }
            // SDR content usually declares no color metadata at all, which
            // would leave the page without any color line (mpv reads live
            // decoder properties and never goes quiet). State it explicitly.
            // NOTE: deliberately not polluting hdrFormat — the JS-route
            // overlay prints hdrFormat verbatim as an HDR label.
            if (f.colorInfo == null) {
                info["colorTransfer"] = "SDR"
            }
        }

        audioFormat?.let { f ->
            f.sampleMimeType?.let { info["audioCodec"] = it }
            val aBitrate = if (f.averageBitrate != Format.NO_VALUE) {
                f.averageBitrate
            } else {
                f.peakBitrate
            }
            if (aBitrate != Format.NO_VALUE && aBitrate > 0) {
                info["audioBitrate"] = aBitrate.toDouble()
            }
            if (f.channelCount > 0) info["audioChannels"] = f.channelCount
            if (f.sampleRate > 0) info["audioSampleRate"] = f.sampleRate
        }

        latestTechnicalInfo = info
    }

    private fun pickFormat(tracks: Tracks, type: Int): Format? {
        val group = tracks.groups.firstOrNull { it.type == type } ?: return null
        for (i in 0 until group.length) {
            if (group.isTrackSelected(i)) return group.getTrackFormat(i)
        }
        for (i in 0 until group.length) {
            if (group.isTrackSupported(i)) return group.getTrackFormat(i)
        }
        return null
    }

    /** Identity of what a decoder would be initialized for (mime + codec). */
    private fun decoderKey(format: Format?): String? =
        format?.let { "${it.sampleMimeType}/${it.codecs}" }

    /** HDR10 vs HDR10+ isn't distinguishable from Format alone; both report HDR10. */
    private fun deriveHdrFormat(ci: ColorInfo): String? {
        return when (ci.colorTransfer) {
            C.COLOR_TRANSFER_HLG -> "HLG"
            C.COLOR_TRANSFER_ST2084 -> "HDR10"
            else -> null
        }
    }

    private fun colorSpaceName(value: Int): String? = when (value) {
        Format.NO_VALUE -> null
        C.COLOR_SPACE_BT709 -> "BT.709"
        C.COLOR_SPACE_BT601 -> "BT.601"
        C.COLOR_SPACE_BT2020 -> "BT.2020"
        else -> "Unknown"
    }

    private fun colorRangeName(value: Int): String? = when (value) {
        Format.NO_VALUE -> null
        C.COLOR_RANGE_LIMITED -> "Limited"
        C.COLOR_RANGE_FULL -> "Full"
        else -> "Unknown"
    }

    private fun colorTransferName(value: Int): String? = when (value) {
        Format.NO_VALUE -> null
        C.COLOR_TRANSFER_SDR -> "SDR"
        C.COLOR_TRANSFER_ST2084 -> "ST2084 (PQ)"
        C.COLOR_TRANSFER_HLG -> "HLG"
        C.COLOR_TRANSFER_GAMMA_2_2 -> "Gamma 2.2"
        else -> "Unknown"
    }

    // MARK: - Listeners

    private val analyticsListener = object : AnalyticsListener {
        override fun onVideoDecoderInitialized(
            eventTime: AnalyticsListener.EventTime,
            decoderName: String,
            initializedTimestampMs: Long,
        ) {
            videoDecoderName = decoderName
        }

        override fun onAudioDecoderInitialized(
            eventTime: AnalyticsListener.EventTime,
            decoderName: String,
            initializedTimestampMs: Long,
        ) {
            audioDecoderName = decoderName
        }

        override fun onDroppedVideoFrames(
            eventTime: AnalyticsListener.EventTime,
            droppedFrames: Int,
            elapsedMs: Long,
        ) {
            // Accumulate for a cumulative total matching mpv's semantics.
            cumulativeDroppedFrames += droppedFrames
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onCues(cueGroup: CueGroup) {
            currentSubtitleCues = cueGroup.cues
            applySubtitleCues()
        }

        override fun onVideoSizeChanged(videoSize: VideoSize) {
            if (videoSize.width <= 0 || videoSize.height <= 0) return
            cachedVideoWidth = videoSize.width
            cachedVideoHeight = videoSize.height
            currentVideoAspectRatio =
                videoSize.width * videoSize.pixelWidthHeightRatio / videoSize.height
            delegate?.onVideoDimensionsChanged(videoSize.width, videoSize.height)
            updateVideoSurfaceLayout()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            when (playbackState) {
                Player.STATE_BUFFERING -> delegate?.onLoadingChanged(true)
                Player.STATE_READY -> {
                    delegate?.onLoadingChanged(false)
                    delegate?.onReadyToSeek()
                    if (!tracksReadyFired) {
                        tracksReadyFired = true
                        rebuildTrackMaps(player?.currentTracks)
                        delegate?.onTracksReady()
                    }
                }
                Player.STATE_ENDED -> delegate?.onPlaybackEnded()
                else -> {}
            }
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            // Authoritative pause intent — fires on pause/resume even while
            // buffering. Mirrors mpv reporting the `pause` property.
            cachedPlayWhenReady = playWhenReady
            delegate?.onPauseChanged(!playWhenReady)
        }

        override fun onPlayerErrorChanged(error: PlaybackException?) {
            // Null = a previous error was cleared (recovering), not a failure.
            if (error == null) return
            val message = error.message ?: "Unknown playback error"
            Log.e(TAG, "Player error: $message", error)
            delegate?.onError(message)
        }

        override fun onTracksChanged(tracks: Tracks) {
            rebuildTrackMaps(tracks)
            // currentSubtitleId is a hand-maintained cache; re-derive from the
            // actual selection before applying the initial selections so an
            // explicit initial selection still wins.
            syncCurrentSubtitleIdFromSelection(tracks)
            applyInitialTrackSelections()
            // A codec change re-initializes the decoder under a different
            // name; clear the stale one. But onTracksChanged also fires for
            // selection changes that keep the codecs (a text-track override,
            // say), and the decoder init callbacks only fire again on a real
            // re-init — clearing unconditionally would blank the technical
            // overlay until the next codec init. Only clear per codec, keyed
            // on what actually picks the decoder.
            val videoKey = decoderKey(pickFormat(tracks, C.TRACK_TYPE_VIDEO))
            if (videoKey != lastVideoDecoderKey) {
                lastVideoDecoderKey = videoKey
                videoDecoderName = null
            }
            val audioKey = decoderKey(pickFormat(tracks, C.TRACK_TYPE_AUDIO))
            if (audioKey != lastAudioDecoderKey) {
                lastAudioDecoderKey = audioKey
                audioDecoderName = null
            }
        }
    }

    // MARK: - Progress loop

    private val progressRunnable = object : Runnable {
        override fun run() {
            val p = player ?: return
            val positionMs = p.currentPosition
            val durationMs = p.duration
            val bufferedMs = p.bufferedPosition

            cachedPositionSec = positionMs / 1000.0
            cachedDurationSec = if (durationMs > 0) durationMs / 1000.0 else 0.0
            cachedCacheSeconds =
                if (bufferedMs > positionMs) (bufferedMs - positionMs) / 1000.0 else 0.0

            refreshTechnicalInfo()

            // mpv goes silent while paused — the chrome's Choreographer clock
            // interpolates instead. Match that: no ticks while paused.
            if (p.playWhenReady) {
                delegate?.onPositionChanged(
                    cachedPositionSec,
                    cachedDurationSec,
                    cachedCacheSeconds,
                )
            }

            mainHandler.postDelayed(this, PROGRESS_INTERVAL_MS)
        }
    }

    private fun startProgressLoop() {
        stopProgressLoop()
        mainHandler.postDelayed(progressRunnable, PROGRESS_INTERVAL_MS)
    }

    private fun stopProgressLoop() {
        mainHandler.removeCallbacks(progressRunnable)
    }

    // MARK: - State snapshots

    override val videoWidth: Int get() = cachedVideoWidth
    override val videoHeight: Int get() = cachedVideoHeight
    override val isPausedState: Boolean get() = !cachedPlayWhenReady
    override val currentPosition: Double get() = cachedPositionSec
    override val duration: Double get() = cachedDurationSec

    /** Post to main if not already there — media3 Player access is main-only. */
    private fun post(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            block()
        } else {
            mainHandler.post(block)
        }
    }
}
