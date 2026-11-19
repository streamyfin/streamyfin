package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.nativeplayer.ChapterRecord
import expo.modules.mpvplayer.nativeplayer.EpisodeListItemRecord
import expo.modules.mpvplayer.nativeplayer.MediaSegmentRecord
import expo.modules.mpvplayer.nativeplayer.MetadataRecord
import expo.modules.mpvplayer.nativeplayer.NextEpisodeRecord
import expo.modules.mpvplayer.nativeplayer.RemotePlayerConfigRecord
import expo.modules.mpvplayer.nativeplayer.TrackMenusRecord
import expo.modules.mpvplayer.nativeplayer.TrickplayRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

// What a remote screen emits carries `remote = true`, so JS's local player never reports a playback that
// is not its own; and a remote config reaches the view model as a present config with no stream at all.
class RemoteEventsTest {
    @Test
    fun everyRemoteEventSaysItIsRemote() {
        val bodies = listOf(
            emptyMap(),
            mapOf("reason" to "closeButton"),
            // Whatever a body claims, the mark wins.
            mapOf("remote" to false, "positionSec" to 3.0),
        )
        for (body in bodies) {
            val marked = markRemote(body)
            assertEquals(true, marked["remote"])
            assertEquals(body - "remote", marked - "remote")
        }
    }

    @Test
    fun aRemoteConfigBecomesAPresentConfigWithNoStream() {
        val remote = RemotePlayerConfigRecord().also {
            it.metadata = MetadataRecord().also { metadata -> metadata.itemId = "item"; metadata.title = "Bench episode" }
            it.targetName = "Bench TV"
            it.chapters = listOf(ChapterRecord().also { chapter -> chapter.name = "Opening" })
            it.segments = listOf(MediaSegmentRecord().also { segment -> segment.type = "Intro" })
            it.trickplay = TrickplayRecord()
            it.nextEpisode = NextEpisodeRecord().also { next -> next.itemId = "next" }
            it.episodeList = listOf(EpisodeListItemRecord())
            it.tracks = TrackMenusRecord()
            it.ui.seekForwardSec = 30.0
        }

        val present = remote.toPresentConfig()

        assertEquals("", present.stream.url)
        assertNull(present.stream.toVideoLoadConfig())
        assertNull(present.engine)
        assertNull(present.syncPlay)
        assertSame(remote.metadata, present.metadata)
        assertSame(remote.chapters, present.chapters)
        assertSame(remote.segments, present.segments)
        assertSame(remote.trickplay, present.trickplay)
        assertSame(remote.nextEpisode, present.nextEpisode)
        assertSame(remote.episodeList, present.episodeList)
        assertSame(remote.tracks, present.tracks)
        assertSame(remote.ui, present.ui)
    }
}
