package expo.modules.mpvplayer.nativeplayer.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// A remote engine carries transport and queue, never a surface: this double compiles
// against the two interfaces only, which is the whole point of the split.
class EngineInterfacesTest {
    private class RemoteOnlyEngine : TransportEngine, QueueEngine {
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

    @Test
    fun aRemoteEngineNeedsNoRenderingMembers() {
        val engine = RemoteOnlyEngine()
        engine.play()
        assertEquals(1, engine.played)
        assertTrue(engine !is RenderingEngine)
    }

    @Test
    fun theQueueHasNothingByDefault() {
        val engine = RemoteOnlyEngine()
        assertNull(engine.currentItemId)
        assertNull(engine.targetVolume)
        engine.skipToNext()
        engine.enqueue(listOf("a"))
        assertNull(engine.currentItemId)
    }

    @Test
    fun seekToTrackedKeepsItsDefault() {
        val engine = RemoteOnlyEngine()
        engine.seekToTracked(12.0, exact = true, requestId = 7)
        engine.seekToTracked(3.0, exact = false, requestId = 8)
        assertEquals(listOf("seekToExact 12.0", "seekTo 12.0", "seekTo 3.0"), engine.seeks)
    }
}
