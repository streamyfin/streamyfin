package expo.modules.mpvplayer.nativeplayer.engine

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
 * decoder.
 *
 * The interface has three faces: [TransportEngine] (what every chrome mode calls),
 * [RenderingEngine] (what only a local decoder has) and [QueueEngine] (what only a
 * target with a list has). The local engines, mpv and ExoPlayer, carry all three; a
 * remote engine carries transport and queue, and the chrome in remote mode never
 * calls the rendering face.
 */
interface PlayerEngine : TransportEngine, RenderingEngine, QueueEngine {

    /** Process-level player slot; mapped onto the shared single-player gate. */
    enum class Owner { EMBEDDED_VIEW, NATIVE_SESSION }

    /**
     * The transport delegate under the name its implementers use (the chrome's view model and
     * the embedded view); the engines hold it as [TransportEngine.Delegate].
     */
    interface Delegate : TransportEngine.Delegate
}
