@file:OptIn(androidx.media3.common.util.UnstableApi::class)

package expo.modules.exoplayerplayer

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewGroup
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ColorInfo
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Configuration for loading a video. Mirrors MpvPlayerView.VideoLoadConfig —
 * MPV-only fields are accepted and ignored.
 */
data class VideoLoadConfig(
    val url: String,
    val headers: Map<String, String>? = null,
    val externalSubtitles: List<String>? = null,
    val startPosition: Double? = null,
    val autoplay: Boolean = true,
    val initialSubtitleId: Int? = null,
    val initialAudioId: Int? = null,
    val cacheEnabled: String? = null,
    val cacheSeconds: Int? = null,
    val demuxerMaxBytes: Int? = null,
    val demuxerMaxBackBytes: Int? = null,
)

/**
 * ExoPlayerView — ExpoView that hosts a Media3 ExoPlayer instance.
 *
 * Implements the same JS contract (events, ref methods, 1-based track IDs)
 * as MpvPlayerView so the React layer can swap between the two without
 * changes. Subtitle styling is mapped to androidx.media3.ui.SubtitleView +
 * CaptionStyleCompat. PiP methods are no-ops (TV doesn't use PiP).
 */
class ExoPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    companion object {
        private const val TAG = "ExoPlayerView"
        private const val PROGRESS_INTERVAL_MS = 1000L
    }

    // Event dispatchers — names must match the Events() declaration in the module.
    val onLoad by EventDispatcher()
    val onPlaybackStateChange by EventDispatcher()
    val onProgress by EventDispatcher()
    val onError by EventDispatcher()
    val onTracksReady by EventDispatcher()
    val onPictureInPictureChange by EventDispatcher()

    private val mainHandler = Handler(Looper.getMainLooper())

    private var player: ExoPlayer? = null
    private val playerView: PlayerView
    private val subtitleView: SubtitleView?

    private var currentUrl: String? = null
    private var pendingConfig: VideoLoadConfig? = null
    private var tracksReadyFired: Boolean = false

    // Side-loaded subtitle configurations accumulated across loadVideo and
    // addSubtitleFile. Media3 doesn't expose the live SubtitleConfiguration
    // list on a playing MediaItem, so we shadow it here to preserve prior
    // side-loaded subs when addSubtitleFile rebuilds the MediaItem.
    private var sideLoadedSubs: List<MediaItem.SubtitleConfiguration> = emptyList()

    // 1-based track ID mappings (matching MPV's contract).
    // Each list is rebuilt on Tracks changed.
    private var subtitleTrackList: List<TrackEntry> = emptyList()
    private var audioTrackList: List<TrackEntry> = emptyList()
    private var currentSubtitleId: Int = 0
    private var currentAudioId: Int = 0

    // Subtitle styling state — applied to the embedded SubtitleView.
    private var subtitleScale: Float = 1f
    private var subtitleFontSizePct: Int? = null // 0-100
    // Last-write-wins override of the vertical position fraction
    // (null = fall back to subtitleAlignY). Both setSubtitlePosition
    // (0-100, MPV convention where 100 = bottom) and setSubtitleMarginY
    // (px) funnel into this single SubtitleView API.
    private var subtitleBottomFraction: Float? = null
    private var subtitleAlignY: String = "bottom"
    // Background color carries its own alpha (parsed from #RRGGBBAA in
    // setSubtitleBackgroundColor) so no separate enabled/opacity flags.
    private var subtitleBackgroundColor: Int = Color.argb(0, 0, 0, 0)
    private var subtitleBorderStyle: String = "outline-and-shadow"

    private var isZoomedToFill: Boolean = false

    // Captured by analyticsListener; surfaced via getTechnicalInfo().
    // Reset on destroy() and (for decoder names) on track changes.
    private var videoDecoderName: String? = null
    private var audioDecoderName: String? = null
    private var cumulativeDroppedFrames: Int = 0

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
            // Incremental count since last call; accumulate for a cumulative
            // total that matches MPV's droppedFrames semantics.
            cumulativeDroppedFrames += droppedFrames
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            when (playbackState) {
                Player.STATE_BUFFERING -> {
                    onPlaybackStateChange(mapOf("isLoading" to true))
                }
                Player.STATE_READY -> {
                    onPlaybackStateChange(mapOf(
                        "isLoading" to false,
                        "isReadyToSeek" to true
                    ))
                    if (!tracksReadyFired) {
                        tracksReadyFired = true
                        rebuildTrackMaps(player?.currentTracks)
                        onTracksReady(emptyMap<String, Any>())
                    }
                }
                Player.STATE_ENDED -> {
                    onPlaybackStateChange(mapOf(
                        "isPlaying" to false,
                        "isPaused" to true
                    ))
                }
                Player.STATE_IDLE -> {
                    // no-op
                }
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            onPlaybackStateChange(mapOf(
                "isPlaying" to isPlaying,
                "isPaused" to !isPlaying
            ))
        }

        override fun onPlayerErrorChanged(error: androidx.media3.common.PlaybackException?) {
            val message = error?.message ?: "Unknown playback error"
            Log.e(TAG, "Player error: $message", error)
            onError(mapOf("error" to message))
        }

        override fun onTracksChanged(tracks: Tracks) {
            rebuildTrackMaps(tracks)
            applyInitialTrackSelections()
            // A track change can re-initialize the codec under a different
            // name (e.g. adaptive switch from HEVC to AV1). Clear stale
            // decoder names so getTechnicalInfo() doesn't report the
            // previous codec until the next onVideoDecoderInitialized fires.
            videoDecoderName = null
            audioDecoderName = null
        }
    }

    private val progressRunnable = object : Runnable {
        override fun run() {
            val p = player ?: return
            val positionMs = p.currentPosition
            val durationMs = p.duration
            val bufferedMs = p.bufferedPosition

            val positionSec = positionMs / 1000.0
            val durationSec = if (durationMs > 0) durationMs / 1000.0 else 0.0
            val cacheSec = if (bufferedMs > positionMs) (bufferedMs - positionMs) / 1000.0 else 0.0

            onProgress(mapOf(
                "position" to positionSec,
                "duration" to durationSec,
                "progress" to if (durationSec > 0) positionSec / durationSec else 0.0,
                "cacheSeconds" to cacheSec
            ))

            mainHandler.postDelayed(this, PROGRESS_INTERVAL_MS)
        }
    }

    init {
        setBackgroundColor(Color.BLACK)

        playerView = PlayerView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            // SurfaceView-backed for parity with MPV (direct surface to
            // SurfaceFlinger). PlayerView defaults to a SurfaceView, so no
            // explicit setSurfaceType() call is needed; the int constants
            // backing it are @IntDef private in Media3.
            setUseController(false)
            setResizeMode(androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT)
        }
        subtitleView = playerView.subtitleView
        addView(playerView)
    }

    // MARK: - Video Loading

    fun loadVideo(config: VideoLoadConfig) {
        if (currentUrl == config.url) return
        currentUrl = config.url
        pendingConfig = config
        ensurePlayer(config)
        loadInternal(config)
    }

    private fun ensurePlayer(config: VideoLoadConfig) {
        if (player != null) return

        val loadControl = buildLoadControl(config)

        // PREFER extension renderers so the FFmpeg decoder (DTS / TrueHD /
        // AC-4 / WMA / etc.) takes over when MediaCodec doesn't ship a
        // hardware decoder for the format. MediaCodec remains the fallback.
        val renderersFactory = androidx.media3.exoplayer.DefaultRenderersFactory(context)
            .setExtensionRendererMode(
                androidx.media3.exoplayer.DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER
            )
            .setEnableDecoderFallback(true)

        val exo = ExoPlayer.Builder(context, renderersFactory)
            .setLoadControl(loadControl)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                /* handleAudioFocus = */ true
            )
            .build()

        exo.addListener(playerListener)
        exo.addAnalyticsListener(analyticsListener)
        exo.repeatMode = Player.REPEAT_MODE_OFF
        player = exo
        playerView.player = exo

        applySubtitleStyle()
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
        // faster start; we intentionally keep the older 2500/5000 here
        // because low-RAM Android TVs with slow tuners benefit from the
        // extra headroom before playback kicks in. Media3's DEFAULT_*
        // IntDef fields are private, hence the literals.
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

        val builder = DefaultLoadControl.Builder()
            .setTargetBufferBytes(if (!cacheEnabled) 0 else ((config.demuxerMaxBytes ?: 150) * 1024 * 1024))
            .setBufferDurationsMs(
                /* minBufferMs = */ defaultMinBufferMs,
                /* maxBufferMs = */ targetBufferMs,
                /* bufferForPlaybackMs = */ defaultBufferForPlaybackMs,
                /* bufferForPlaybackAfterRebufferMs = */ defaultBufferForPlaybackAfterRebufferMs
            )
        if (cacheEnabled) {
            builder.setBackBuffer(backBufferMs, /* retainBackBufferFromKeyframe = */ true)
        }
        return builder.build()
    }

    private fun loadInternal(config: VideoLoadConfig) {
        val p = player ?: return

        val httpFactory = androidx.media3.datasource.DefaultHttpDataSource.Factory()
            .setDefaultRequestProperties(config.headers ?: emptyMap())
        val dataSourceFactory = DefaultDataSource.Factory(context, httpFactory)

        val mediaItem = buildMediaItem(config)

        val mediaSource = DefaultMediaSourceFactory(dataSourceFactory)
            .createMediaSource(mediaItem)

        p.setMediaSource(mediaSource)
        p.prepare()

        // Apply initial playback position
        config.startPosition?.let { startPosSec ->
            if (startPosSec > 0) {
                p.seekTo((startPosSec * 1000).toLong())
            }
        }

        if (config.autoplay) {
            p.play()
        }

        onLoad(mapOf("url" to config.url))
        startProgressLoop()
    }

    private fun buildMediaItem(config: VideoLoadConfig): MediaItem {
        val builder = MediaItem.Builder().setUri(config.url)

        // External subtitles: add as side-loaded SubtitleConfigurations.
        // MIME-type sniffed from the file extension.
        val subs = config.externalSubtitles
        if (!subs.isNullOrEmpty()) {
            val subtitleConfigs = subs.mapNotNull { subUrl ->
                val mime = mimeTypeForSubtitleUrl(subUrl) ?: return@mapNotNull null
                MediaItem.SubtitleConfiguration.Builder(Uri.parse(subUrl))
                    .setMimeType(mime)
                    .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                    .build()
            }
            if (subtitleConfigs.isNotEmpty()) {
                sideLoadedSubs = subtitleConfigs
                builder.setSubtitleConfigurations(subtitleConfigs)
            } else {
                sideLoadedSubs = emptyList()
            }
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

    // MARK: - Playback Controls

    fun play() {
        player?.play()
    }

    fun pause() {
        player?.pause()
    }

    fun destroy() {
        stopProgressLoop()
        player?.release()
        player = null
        playerView.player = null
        tracksReadyFired = false
        currentUrl = null
        sideLoadedSubs = emptyList()
        subtitleTrackList = emptyList()
        audioTrackList = emptyList()
        currentSubtitleId = 0
        currentAudioId = 0
        videoDecoderName = null
        audioDecoderName = null
        cumulativeDroppedFrames = 0
    }

    fun seekTo(positionSec: Double) {
        player?.seekTo((positionSec * 1000).toLong())
    }

    fun seekBy(offsetSec: Double) {
        val p = player ?: return
        val target = (p.currentPosition + offsetSec * 1000).coerceAtLeast(0.0)
        p.seekTo(target.toLong())
    }

    fun setSpeed(speed: Double) {
        player?.playbackParameters = PlaybackParameters(speed.toFloat())
    }

    fun getSpeed(): Float {
        return player?.playbackParameters?.speed ?: 1f
    }

    fun isPaused(): Boolean {
        return player?.isPlaying == false
    }

    fun getCurrentPosition(): Double {
        return (player?.currentPosition ?: 0L) / 1000.0
    }

    fun getDuration(): Double {
        val d = player?.duration ?: 0L
        return if (d > 0) d / 1000.0 else 0.0
    }

    // MARK: - Track Mapping (1-based IDs to match MPV's contract)

    data class TrackEntry(
        val id: Int,          // 1-based JS-facing ID
        val trackGroupIndex: Int,
        val trackIndex: Int,
        val format: Format,
    )

    private fun rebuildTrackMaps(tracks: Tracks?) {
        if (tracks == null) return

        val subtitles = mutableListOf<TrackEntry>()
        val audios = mutableListOf<TrackEntry>()

        tracks.groups.forEachIndexed { groupIndex, group ->
            val rendererType = group.type
            // Skip groups that have no tracks the player supports
            for (trackIdx in 0 until group.length) {
                if (!group.isTrackSupported(trackIdx)) continue
                val format = group.getTrackFormat(trackIdx)
                val entry = TrackEntry(
                    id = 0, // assigned per-list below
                    trackGroupIndex = groupIndex,
                    trackIndex = trackIdx,
                    format = format
                )
                when (rendererType) {
                    C.TRACK_TYPE_TEXT -> subtitles.add(entry)
                    C.TRACK_TYPE_AUDIO -> audios.add(entry)
                    else -> { /* video / metadata ignored */ }
                }
            }
        }

        // Assign 1-based IDs per track kind.
        subtitles.forEachIndexed { i, e -> subtitles[i] = e.copy(id = i + 1) }
        audios.forEachIndexed { i, e -> audios[i] = e.copy(id = i + 1) }

        subtitleTrackList = subtitles
        audioTrackList = audios
    }

    private fun applyInitialTrackSelections() {
        val p = player ?: return
        val cfg = pendingConfig ?: return

        // Initial subtitle/audio selection by 1-based ID.
        if (cfg.initialAudioId != null && cfg.initialAudioId > 0) {
            setAudioTrack(cfg.initialAudioId)
        }
        if (cfg.initialSubtitleId == null || cfg.initialSubtitleId <= 0) {
            disableSubtitles()
        } else {
            setSubtitleTrack(cfg.initialSubtitleId)
        }

        // Only apply once per source load.
        pendingConfig = null
    }

    // MARK: - Subtitle Controls

    fun getSubtitleTracks(): List<Map<String, Any>> {
        return subtitleTrackList.map { entry ->
            mapOf(
                "id" to entry.id,
                "title" to (entry.format.label ?: ""),
                "lang" to (entry.format.language ?: "")
            )
        }
    }

    fun setSubtitleTrack(trackId: Int) {
        val p = player ?: return
        val entry = subtitleTrackList.firstOrNull { it.id == trackId } ?: return
        val matchedGroup = p.currentTracks.groups[entry.trackGroupIndex].mediaTrackGroup

        // setOverrideForType replaces any existing override of the same
        // track type — exactly what we want for single-track subtitle pickers.
        val params = p.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            .setOverrideForType(TrackSelectionOverride(matchedGroup, entry.trackIndex))
            .build()
        p.trackSelectionParameters = params
        currentSubtitleId = trackId
    }

    fun disableSubtitles() {
        val p = player ?: return
        val params = p.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .build()
        p.trackSelectionParameters = params
        currentSubtitleId = 0
    }

    fun getCurrentSubtitleTrack(): Int = currentSubtitleId

    fun addSubtitleFile(url: String, select: Boolean) {
        val p = player ?: return
        val mime = mimeTypeForSubtitleUrl(url) ?: return
        val currentMediaItem = p.currentMediaItem ?: return
        val newSubConfig = MediaItem.SubtitleConfiguration.Builder(Uri.parse(url))
            .setMimeType(mime)
            .setSelectionFlags(if (select) C.SELECTION_FLAG_DEFAULT else 0)
            .build()

        // Rebuild with the full accumulated list so previously loaded
        // side-loaded subs (from VideoLoadConfig.externalSubtitles or
        // earlier addSubtitleFile calls) survive.
        val combined = sideLoadedSubs + newSubConfig
        sideLoadedSubs = combined

        val rebuilt = currentMediaItem.buildUpon()
            .setSubtitleConfigurations(combined)
            .build()

        val wasPlaying = p.isPlaying
        val pos = p.currentPosition
        p.setMediaItem(rebuilt, pos)
        p.prepare()
        if (wasPlaying) p.play()

        // If text tracks were disabled (e.g. disableSubtitles was called
        // earlier, or playback started with subtitles off), the new
        // subtitle — even with SELECTION_FLAG_DEFAULT — won't render.
        // Re-enable the text track type when the caller asks us to select.
        if (select) {
            val params = p.trackSelectionParameters.buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                .build()
            p.trackSelectionParameters = params
        }
    }

    // MARK: - Subtitle Positioning / Styling

    fun setSubtitlePosition(position: Int) {
        // position is 0-100 (MPV convention: 100 = bottom, 0 = top).
        // Map to SubtitleView's bottom-padding fraction. Reserve a small
        // margin so 100 doesn't hug the very bottom edge.
        val clamped = position.coerceIn(0, 100)
        subtitleBottomFraction = 0.95f - (clamped / 100f) * 0.87f
        applySubtitleStyle()
    }

    fun setSubtitleScale(scale: Double) {
        subtitleScale = scale.toFloat()
        applySubtitleStyle()
    }

    fun setSubtitleMarginY(margin: Int) {
        // Margin in px (approximate). SubtitleView only accepts a single
        // bottom-padding fraction, so convert via a heuristic (1px ≈ 0.1%
        // of view height, capped). Last-write-wins vs. setSubtitlePosition.
        val fraction = (margin / 1000f).coerceIn(0.02f, 0.95f)
        subtitleBottomFraction = fraction
        applySubtitleStyle()
    }

    fun setSubtitleAlignY(alignment: String) {
        subtitleAlignY = alignment
        applySubtitleStyle()
    }

    fun setSubtitleFontSize(size: Int) {
        subtitleFontSizePct = size
        applySubtitleStyle()
    }

    fun setSubtitleBackgroundColor(colorHex: String) {
        subtitleBackgroundColor = parseColor(colorHex, subtitleBackgroundColor)
        applySubtitleStyle()
    }

    fun setSubtitleBorderStyle(style: String) {
        subtitleBorderStyle = style
        applySubtitleStyle()
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
        } catch (_: Throwable) {
            fallback
        }
    }

    private fun applySubtitleStyle() {
        val sv = subtitleView ?: return

        // Text size: explicit % wins; otherwise scale the default.
        val textSizeFraction = if (subtitleFontSizePct != null) {
            (subtitleFontSizePct!! / 100f) * SubtitleView.DEFAULT_TEXT_SIZE_FRACTION
        } else {
            SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * subtitleScale
        }
        sv.setFractionalTextSize(textSizeFraction)

        // Vertical position: explicit fraction (from setSubtitlePosition /
        // setSubtitleMarginY) wins; otherwise fall back to alignY mapping.
        val alignYFraction = when (subtitleAlignY) {
            "top" -> 0.9f
            "center" -> 0.5f
            else -> 0.08f // bottom
        }
        val bottomFraction = subtitleBottomFraction ?: alignYFraction
        sv.setBottomPaddingFraction(bottomFraction.coerceIn(0.02f, 0.95f))

        // Edge / background style.
        val foreground = Color.WHITE
        val edgeType: Int
        val backgroundColor: Int
        when (subtitleBorderStyle) {
            "background-box" -> {
                edgeType = CaptionStyleCompat.EDGE_TYPE_NONE
                // subtitleBackgroundColor already carries its own alpha
                // (parsed from #RRGGBBAA by setSubtitleBackgroundColor).
                // Alpha 0 → transparent, matching user intent.
                backgroundColor = subtitleBackgroundColor
            }
            else -> {
                // "outline-and-shadow"
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
            Typeface.SANS_SERIF
        )
        sv.setApplyEmbeddedStyles(false)
        sv.setApplyEmbeddedFontSizes(false)
        sv.setStyle(style)
    }

    // MARK: - Audio Track Controls

    fun getAudioTracks(): List<Map<String, Any>> {
        return audioTrackList.map { entry ->
            // channelCount is Format.NO_VALUE (-1) when unknown — report 0.
            val channels = if (entry.format.channelCount == Format.NO_VALUE) 0
                else entry.format.channelCount
            mapOf(
                "id" to entry.id,
                "title" to (entry.format.label ?: ""),
                "lang" to (entry.format.language ?: ""),
                "codec" to (entry.format.sampleMimeType ?: ""),
                "channels" to channels
            )
        }
    }

    fun setAudioTrack(trackId: Int) {
        val p = player ?: return
        val entry = audioTrackList.firstOrNull { it.id == trackId } ?: return
        val matchedGroup = p.currentTracks.groups[entry.trackGroupIndex].mediaTrackGroup

        val params = p.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
            .setOverrideForType(TrackSelectionOverride(matchedGroup, entry.trackIndex))
            .build()
        p.trackSelectionParameters = params
        currentAudioId = trackId
    }

    fun getCurrentAudioTrack(): Int = currentAudioId

    // MARK: - Video Scaling

    fun setZoomedToFill(zoomed: Boolean) {
        isZoomedToFill = zoomed
        val resizeMode = if (zoomed) {
            androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_ZOOM
        } else {
            androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT
        }
        playerView.resizeMode = resizeMode
    }

    fun isZoomedToFill(): Boolean = isZoomedToFill

    // MARK: - Technical Info

    fun getTechnicalInfo(): Map<String, Any> {
        val p = player ?: return emptyMap()
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

        // Dropped frames — populated by analyticsListener.onDroppedVideoFrames.
        if (cumulativeDroppedFrames > 0) {
            info["droppedFrames"] = cumulativeDroppedFrames
        }

        // Decoder info — populated by analyticsListener.onVideo/AudioDecoderInitialized.
        // For ExoPlayer this replaces MPV's voDriver/hwdec pairing. The
        // FFmpeg extension reports names beginning with "FFmpeg", which we
        // classify as software; everything else is MediaCodec (hardware).
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
            // FPS: Format.NO_VALUE (-1f) means unknown — omit so the
            // overlay skips the row instead of showing "-1".
            if (f.frameRate > 0f) {
                info["fps"] = f.frameRate.toDouble()
            }
            // Bitrate: prefer average, fall back to peak. Both can be
            // NO_VALUE for adaptive HLS renditions — omit when unknown
            // rather than reporting 0 Kbps.
            val vBitrate = if (f.averageBitrate != Format.NO_VALUE) {
                f.averageBitrate
            } else {
                f.peakBitrate
            }
            if (vBitrate != Format.NO_VALUE && vBitrate > 0) {
                info["videoBitrate"] = vBitrate.toDouble()
            }

            // Raw codec tag from the container (e.g. "hev1.2.4.L153.B0").
            // Carries profile / tier / level / constraint bytes — power
            // users can decode it manually to see why a stream hit our
            // HEVC level cap.
            f.codecs?.let { info["videoCodecs"] = it }

            // HDR / color metadata. Format.colorInfo is the authoritative
            // source — the file/Jellyfin may claim HDR but the player is
            // what decides whether the decoder+surface path is HDR-capable.
            f.colorInfo?.let { ci ->
                val hdr = deriveHdrFormat(ci)
                if (hdr != null) info["hdrFormat"] = hdr
                colorSpaceName(ci.colorSpace)?.let { info["colorSpace"] = it }
                colorRangeName(ci.colorRange)?.let { info["colorRange"] = it }
                colorTransferName(ci.colorTransfer)?.let { info["colorTransfer"] = it }
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

        return info
    }

    /**
     * Map the active color transfer to a human-readable HDR format string.
     * Returns null for SDR / unknown so the overlay can skip the row.
     *
     * HDR10 vs HDR10+ distinction isn't possible from Format alone in
     * Media3 — HDR10+ is signaled via ST2094-40 SEI metadata which isn't
     * exposed on Format. Both report as "HDR10" here; that matches what
     * Media3 actually decodes (no HDR10+ tone-mapping).
     */
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

    private fun pickFormat(tracks: Tracks, type: Int): Format? {
        val group = tracks.groups.firstOrNull { it.type == type } ?: return null
        // Selected track wins.
        for (i in 0 until group.length) {
            if (group.isTrackSelected(i)) return group.getTrackFormat(i)
        }
        // Otherwise the first supported track.
        for (i in 0 until group.length) {
            if (group.isTrackSupported(i)) return group.getTrackFormat(i)
        }
        return null
    }

    // MARK: - Progress Loop

    private fun startProgressLoop() {
        stopProgressLoop()
        mainHandler.postDelayed(progressRunnable, PROGRESS_INTERVAL_MS)
    }

    private fun stopProgressLoop() {
        mainHandler.removeCallbacks(progressRunnable)
    }

    // MARK: - Cleanup

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        destroy()
    }
}
