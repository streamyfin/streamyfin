package expo.modules.mpvplayer.nativeplayer.engine

import android.view.Surface
import android.view.SurfaceView
import android.view.View

/**
 * The face of an engine that draws on this device: the video surface, zoom, subtitle
 * rendering and the video's own dimensions. A remote target has none of it, and the
 * chrome in remote mode never asks for it.
 */
interface RenderingEngine {

    /** Engine-owned view to stack between the video SurfaceView and the
     *  ComposeView, e.g. a SubtitleView. Null for engines that render
     *  subtitles inside the video surface (mpv). */
    val subtitleOverlay: View?

    // MARK: - Surface
    fun attachSurfaceView(surfaceView: SurfaceView)
    fun detachSurface()
    /** Engine target size (viewport dims), used to size the surface / zoom. */
    fun updateSurfaceSize(width: Int, height: Int)
    fun isVideoOutputBroken(): Boolean
    fun recoverVideoOutput(surface: Surface?)

    // MARK: - Subtitle rendering
    fun setSubtitlePosition(position: Int)            // mpv-only; no-op elsewhere
    fun setSubtitleScale(scale: Double)
    fun setSubtitleDelay(seconds: Double)             // mpv-only; no-op elsewhere
    fun setSubtitleMarginY(margin: Int)
    fun setSubtitleAlignX(alignment: String)          // mpv-only; no-op elsewhere
    fun setSubtitleAlignY(alignment: String)
    fun setSubtitleStyle(config: Map<String, Any>)
    fun setSubtitleFontSize(size: Int)
    fun setSubtitleBorderStyle(style: String)
    fun setSubtitleBackgroundColor(color: String)
    fun setSubtitleAssOverride(mode: String)          // mpv-only; no-op elsewhere

    // MARK: - Video
    fun setZoomedToFill(zoomed: Boolean)
    fun getTechnicalInfo(): Map<String, Any>

    // MARK: - State snapshots (safe to read off-main; engines cache them)
    val videoWidth: Int
    val videoHeight: Int
}
