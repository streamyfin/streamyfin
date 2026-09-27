package expo.modules.mpvplayer.nativeplayer.engine

import android.view.Surface
import android.view.SurfaceView
import android.view.View

/**
 * Configuration for loading a video. Shared by every engine backed by the
 * native chrome (mpv and Media3/ExoPlayer). `voDriver` is mpv-only and ignored
 * by other engines.
 */
data class VideoLoadConfig(
    val url: String,
    val headers: Map<String, String>? = null,
    val externalSubtitles: List<String>? = null,
    val startPosition: Double? = null,
    val autoplay: Boolean = true,
    val initialSubtitleId: Int? = null,
    val initialAudioId: Int? = null,
    val loop: Boolean = false,
    val voDriver: String? = null,
    val cacheEnabled: String? = null,
    val cacheSeconds: Int? = null,
    val demuxerMaxBytes: Int? = null,
    val demuxerMaxBackBytes: Int? = null,
)

/**
 * Engine-agnostic playback surface consumed by the Compose chrome
 * (NativePlayerSession + PlayerViewModel + controllers). The chrome never
 * touches a concrete engine; each engine maps the interface onto its own
 * decoder. All track ids are the bridge-facing 1-based-per-kind ids both
 * engines already speak.
 *
 * Methods documented "mpv-only" are no-ops on engines without the concept —
 * the same no-op set the JS-route ExoPlayerView already accepts.
 */
interface PlayerEngine {

    /** Process-level player slot; mapped onto the shared single-player gate. */
    enum class Owner { EMBEDDED_VIEW, NATIVE_SESSION }

    /**
     * Engine → chrome callbacks. Mirrors the mpv property observations; a
     * Media3 engine drives the same set from its Player.Listener.
     */
    interface Delegate {
        fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double)
        fun onPauseChanged(isPaused: Boolean)
        fun onLoadingChanged(isLoading: Boolean)
        fun onReadyToSeek()
        fun onTracksReady()
        fun onError(message: String)
        fun onVideoDimensionsChanged(width: Int, height: Int)
        fun onPlaybackEnded() {}
        fun onChaptersChanged(chapters: List<Map<String, Any>>) {}
        // Dead on Android (no HDR detection); kept for iOS parity.
        fun onHDRModeDetected(isHdr: Boolean, fps: Double) {}
    }

    var delegate: Delegate?

    /** Engine-owned view to stack between the video SurfaceView and the
     *  ComposeView, e.g. a SubtitleView. Null for engines that render
     *  subtitles inside the video surface (mpv). */
    val subtitleOverlay: View?

    // MARK: - Lifecycle
    fun start(owner: Owner, onStarted: () -> Unit)
    fun stop()
    fun attachSurfaceView(surfaceView: SurfaceView)
    fun detachSurface()
    /** Engine target size (viewport dims), used to size the surface / zoom. */
    fun updateSurfaceSize(width: Int, height: Int)
    fun isVideoOutputBroken(): Boolean
    var playbackResumeIntent: Boolean
    fun recoverVideoOutput(surface: Surface?)

    // MARK: - Loading
    fun load(config: VideoLoadConfig)
    fun reloadCurrentItem()

    // MARK: - Transport
    fun play()
    fun pause()
    fun togglePause()
    fun seekTo(seconds: Double)
    fun seekBy(seconds: Double)
    fun setSpeed(speed: Double)
    fun getSpeed(): Double
    /** Engine mute, retained across reloads (volume left untouched). */
    fun setMute(muted: Boolean)
    fun getChapters(): List<Map<String, Any>>

    // MARK: - Tracks
    fun getSubtitleTracks(): List<Map<String, Any>>
    fun setSubtitleTrack(trackId: Int)
    fun disableSubtitles()
    fun getCurrentSubtitleTrack(): Int
    fun addSubtitleFile(url: String, select: Boolean)
    fun getAudioTracks(): List<Map<String, Any>>
    fun setAudioTrack(trackId: Int)
    fun getCurrentAudioTrack(): Int

    // MARK: - Subtitle rendering
    fun setSubtitlePosition(position: Int)            // mpv-only; no-op elsewhere
    fun setSubtitleScale(scale: Double)
    fun setSubtitleDelay(seconds: Double)             // mpv-only; no-op elsewhere
    fun setSubtitleMarginY(margin: Int)
    fun setSubtitleUseMargins(enabled: Boolean)       // mpv-only; no-op elsewhere
    fun setSubtitleScaleWithWindow(enabled: Boolean)  // mpv-only; no-op elsewhere
    fun setSubtitleAlignX(alignment: String)          // mpv-only; no-op elsewhere
    fun setSubtitleAlignY(alignment: String)
    fun setSubtitleStyle(config: Map<String, Any>)
    fun setSubtitleFontSize(size: Int)
    fun setSubtitleBorderStyle(style: String)
    fun setSubtitleBackgroundColor(color: String)
    fun setSubtitleAssOverride(mode: String)          // mpv-only; no-op elsewhere

    // MARK: - Audio processing
    fun setAudioDelay(seconds: Double)                // mpv-only; no-op elsewhere
    fun setVolumeBoost(percent: Int)                  // exo: maps to player volume
    fun setDialogueBoost(enabled: Boolean)            // mpv-only; no-op elsewhere
    fun setMonoDownmix(enabled: Boolean)              // mpv-only; no-op elsewhere

    // MARK: - Video
    fun setZoomedToFill(zoomed: Boolean)
    fun getTechnicalInfo(): Map<String, Any>

    // MARK: - State snapshots (safe to read off-main; engines cache them)
    val videoWidth: Int
    val videoHeight: Int
    val isPausedState: Boolean
    val currentPosition: Double
    val duration: Double
    val isTv: Boolean
}
