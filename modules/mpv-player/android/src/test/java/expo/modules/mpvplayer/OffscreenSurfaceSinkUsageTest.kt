package expo.modules.mpvplayer

import android.hardware.HardwareBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * ImageReader documents two consumer usages for a PRIVATE reader, GPU_SAMPLED_IMAGE and
 * VIDEO_ENCODE, and may throw on any other: the sink would then not exist and the screen-off
 * playback it keeps alive would stall again on the devices that refuse it.
 */
class OffscreenSurfaceSinkUsageTest {
    private val documentedForPrivate =
        HardwareBuffer.USAGE_GPU_SAMPLED_IMAGE or HardwareBuffer.USAGE_VIDEO_ENCODE

    @Test
    fun theConsumerUsageIsOneImageReaderDocumentsForPrivate() {
        assertNotEquals(0L, OffscreenSurfaceSink.CONSUMER_USAGE)
        assertEquals(0L, OffscreenSurfaceSink.CONSUMER_USAGE and documentedForPrivate.inv())
    }
}
