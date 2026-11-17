package expo.modules.mpvplayer.nativeplayer.remote

import org.junit.Assert.assertEquals
import org.junit.Test

class RemoteSpeechTest {
    @Test
    fun aNamedTvButtonSaysItsSessionState() {
        assertEquals("Living room, Connected", RemoteSpeech.targetButton("Living room", "Cast button", "Connected"))
    }

    @Test
    fun anUnnamedTvButtonSaysTheCastLabelAndItsState() {
        assertEquals("Cast button, Connecting", RemoteSpeech.targetButton(null, "Cast button", "Connecting"))
    }
}
