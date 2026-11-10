package expo.modules.mpvplayer.cast

import android.net.Uri
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.framework.media.ImageHints
import com.google.android.gms.cast.framework.media.ImagePicker
import com.google.android.gms.common.images.WebImage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The receiver sends one artwork per item: every surface the SDK asks for, through the call it makes now, gets it.
@RunWith(RobolectricTestRunner::class)
class CastOptionsProviderTest {
    @Test
    fun everySurfaceGetsTheItemsArtwork() {
        val poster = WebImage(Uri.parse("https://media.example/poster.jpg"))
        val metadata = MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE).apply { addImage(poster) }
        val picker = CastOptionsProvider.FirstImagePicker()

        for (type in listOf(ImagePicker.IMAGE_TYPE_NOTIFICATION_THUMBNAIL, ImagePicker.IMAGE_TYPE_EXPANDED_CONTROLLER_BACKGROUND)) {
            assertEquals(poster, picker.onPickImage(metadata, ImageHints(type, 0, 0)))
        }
        assertNull(picker.onPickImage(null, ImageHints(ImagePicker.IMAGE_TYPE_NOTIFICATION_THUMBNAIL, 0, 0)))
    }
}
