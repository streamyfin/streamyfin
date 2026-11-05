package expo.modules.mpvplayer.cast

import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.MediaTrack
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The media status JS reads, built from real SDK objects. Robolectric only provides a real org.json.
@RunWith(RobolectricTestRunner::class)
class CastRecordsTest {
    // Subtitles picked on the receiver switch its text track and leave the custom data as it was loaded: the record
    // says which tracks are text and which are shown.
    @Test
    fun aStatusSaysWhichTracksTheReceiverShows() {
        val tracks =
            listOf(
                MediaTrack.Builder(1, MediaTrack.TYPE_AUDIO).build(),
                MediaTrack.Builder(3, MediaTrack.TYPE_TEXT).build(),
                MediaTrack.Builder(4, MediaTrack.TYPE_TEXT).build(),
            )
        val media = MediaInfo.Builder("item-1").setStreamType(MediaInfo.STREAM_TYPE_BUFFERED).setMediaTracks(tracks).build()
        val status =
            MediaStatus.Builder()
                .setMediaInfo(media)
                .setPlayerState(MediaStatus.PLAYER_STATE_PLAYING)
                .setActiveTrackIds(longArrayOf(4))
                .build()

        val record = CastRecords.mediaStatus(status)

        assertEquals(listOf(4L), record?.get("activeTrackIds"))
        assertEquals(listOf(3L, 4L), (record?.get("mediaInfo") as? Map<*, *>)?.get("textTrackIds"))
    }
}
