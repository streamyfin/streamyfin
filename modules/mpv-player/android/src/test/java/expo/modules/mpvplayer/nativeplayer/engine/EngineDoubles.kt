package expo.modules.mpvplayer.nativeplayer.engine

import android.view.Surface
import android.view.SurfaceView
import android.view.View

// Engines without a decoder, for what the chrome asks of them: a remote one carries transport and
// queue only, a local one adds the rendering face and notes each call to it.

internal open class RemoteOnlyEngine : ChromeEngine {
    override var delegate: TransportEngine.Delegate? = null
    override var playbackResumeIntent = false
    override var isPausedState = true
    override var currentPosition = 0.0
    override var duration = 0.0
    override val isTv = false
    var played = 0
    val seeks = mutableListOf<String>()
    override fun start(owner: PlayerEngine.Owner, onStarted: () -> Unit) = onStarted()
    override fun stop() {}
    override fun load(config: VideoLoadConfig) {}
    override fun reloadCurrentItem() {}
    override fun play() { played += 1 }
    override fun pause() {}
    override fun togglePause() {}
    override fun seekTo(seconds: Double) { seeks += "seekTo $seconds" }
    // Recorded, then left to the interface default, which goes through seekTo.
    override fun seekToExact(seconds: Double) {
        seeks += "seekToExact $seconds"
        super.seekToExact(seconds)
    }
    override fun seekBy(seconds: Double) {}
    override fun setSpeed(speed: Double) {}
    override fun getSpeed() = 1.0
    override fun setMute(muted: Boolean) {}
    override fun getChapters() = emptyList<Map<String, Any>>()
    override fun getSubtitleTracks() = emptyList<Map<String, Any>>()
    override fun setSubtitleTrack(trackId: Int) {}
    override fun disableSubtitles() {}
    override fun getCurrentSubtitleTrack() = -1
    override fun addSubtitleFile(url: String, select: Boolean) {}
    override fun getAudioTracks() = emptyList<Map<String, Any>>()
    override fun setAudioTrack(trackId: Int) {}
    override fun getCurrentAudioTrack() = -1
    override fun setAudioDelay(seconds: Double) {}
    override fun setVolumeBoost(percent: Int) {}
    override fun setDialogueBoost(enabled: Boolean) {}
    override fun setMonoDownmix(enabled: Boolean) {}
}

internal class RecordingLocalEngine : RemoteOnlyEngine(), PlayerEngine {
    val rendered = mutableListOf<String>()
    override val subtitleOverlay: View? = null
    override fun attachSurfaceView(surfaceView: SurfaceView) { rendered += "attachSurfaceView" }
    override fun detachSurface() { rendered += "detachSurface" }
    override fun updateSurfaceSize(width: Int, height: Int) { rendered += "updateSurfaceSize $width $height" }
    override fun isVideoOutputBroken() = false
    override fun recoverVideoOutput(surface: Surface?) {}
    override fun setSubtitlePosition(position: Int) {}
    override fun setSubtitleScale(scale: Double) { rendered += "setSubtitleScale $scale" }
    override fun setSubtitleDelay(seconds: Double) { rendered += "setSubtitleDelay $seconds" }
    override fun setSubtitleMarginY(margin: Int) { rendered += "setSubtitleMarginY $margin" }
    override fun setSubtitleAlignX(alignment: String) {}
    override fun setSubtitleAlignY(alignment: String) {}
    override fun setSubtitleStyle(config: Map<String, Any>) {}
    override fun setSubtitleFontSize(size: Int) {}
    override fun setSubtitleBorderStyle(style: String) {}
    override fun setSubtitleBackgroundColor(color: String) {}
    override fun setSubtitleAssOverride(mode: String) {}
    override fun setZoomedToFill(zoomed: Boolean) { rendered += "setZoomedToFill $zoomed" }
    override fun getTechnicalInfo(): Map<String, Any> = mapOf("videoCodec" to "h264")
    override val videoWidth = 1920
    override val videoHeight = 1080
}
