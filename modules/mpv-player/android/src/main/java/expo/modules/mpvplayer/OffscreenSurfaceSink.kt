package expo.modules.mpvplayer

import android.graphics.ImageFormat
import android.hardware.HardwareBuffer
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface

/**
 * A surface nobody sees, for mpv to render into while the real one is gone
 * (screen locked, app in the background, the PiP window torn down by a lock).
 *
 * Without a surface mpv's VO fails to reinitialize, the core drops the video
 * track ("Video: no video"), and every track change is followed by a refresh
 * seek to the current position. In a file with no usable seek index (seen with
 * downloaded MKVs) that seek restarts at byte 0 and decodes forward to the
 * position: at 2h22 into a podcast that was ~20 s of silence on every lock
 * and another stall on unlock, the "loading forever" on the lock screen and in
 * PiP. Keeping a surface attached keeps the VO and the track, so there is
 * nothing to seek.
 *
 * Frames are drained and dropped as soon as they arrive, so the producer never
 * blocks on a full queue. Kept tiny: nothing is shown. The format is PRIVATE,
 * the one for pixels nobody reads: with RGBA_8888, a producer that picks
 * another format (mpv's EGL config can give RGBX_8888) makes every acquire
 * throw until Android 17, frame after frame with the screen off.
 */
internal class OffscreenSurfaceSink private constructor(
    private val reader: ImageReader,
    private val thread: HandlerThread,
) {
    val surface: Surface = reader.surface

    fun release() {
        try {
            reader.setOnImageAvailableListener(null, null)
            reader.close()
        } catch (e: Exception) {
            Log.w(TAG, "Releasing the offscreen sink: ${e.message}")
        }
        thread.quitSafely()
    }

    companion object {
        private const val TAG = "OffscreenSurfaceSink"
        const val WIDTH = 64
        const val HEIGHT = 36
        private const val MAX_IMAGES = 3

        /** Null below Android 10, where ImageReader cannot be a GPU target. */
        fun create(): OffscreenSurfaceSink? {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
            val thread = HandlerThread("mpv-offscreen-sink").apply { start() }
            return try {
                val reader = ImageReader.newInstance(
                    WIDTH,
                    HEIGHT,
                    ImageFormat.PRIVATE,
                    MAX_IMAGES,
                    HardwareBuffer.USAGE_GPU_COLOR_OUTPUT,
                )
                reader.setOnImageAvailableListener({ r ->
                    try {
                        r.acquireLatestImage()?.close()
                    } catch (e: Exception) {
                        // A frame dropped late: nothing to show anyway.
                    }
                }, Handler(thread.looper))
                OffscreenSurfaceSink(reader, thread)
            } catch (e: Exception) {
                Log.w(TAG, "No offscreen sink: ${e.message}")
                thread.quitSafely()
                null
            }
        }
    }
}
