package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChromeCapabilitiesTest {
    private val everything = ChromeCapabilities(
        pictureInPicture = true,
        zoom = true,
        brightness = true,
        decoderSettings = true,
        technicalInfo = true,
        speed = true,
    )

    @Test fun aLocalEngineKeepsEveryControl() {
        assertEquals(
            everything,
            ChromeCapabilities.of(isRemote = false, pictureInPictureSupported = true, canChangeSpeed = true),
        )
    }

    @Test fun aDeviceWithoutPictureInPictureLosesOnlyThatButton() {
        assertEquals(
            everything.copy(pictureInPicture = false),
            ChromeCapabilities.of(isRemote = false, pictureInPictureSupported = false, canChangeSpeed = true),
        )
    }

    // A remote engine has no screen here: nothing that drives this device's picture or decoder.
    @Test fun aRemoteEngineOffersNothingThatDrivesThisDevice() {
        assertEquals(
            ChromeCapabilities(
                pictureInPicture = false,
                zoom = false,
                brightness = false,
                decoderSettings = false,
                technicalInfo = false,
                speed = true,
            ),
            ChromeCapabilities.of(isRemote = true, pictureInPictureSupported = true, canChangeSpeed = true),
        )
    }

    // The Cast button hands this device's video off: a local engine shows it when JS allows Cast, a remote one never.
    @Test fun theCastButtonFollowsTheConfigOnLocalEngines() {
        assertTrue(
            ChromeCapabilities.of(isRemote = false, pictureInPictureSupported = true, canChangeSpeed = true, allowCast = true).cast,
        )
        assertFalse(
            ChromeCapabilities.of(isRemote = true, pictureInPictureSupported = true, canChangeSpeed = true, allowCast = true).cast,
        )
        assertFalse(
            ChromeCapabilities.of(isRemote = false, pictureInPictureSupported = true, canChangeSpeed = true, allowCast = false).cast,
        )
    }

    @Test fun speedFollowsWhatTheEngineAllows() {
        assertFalse(
            ChromeCapabilities.of(isRemote = true, pictureInPictureSupported = false, canChangeSpeed = false).speed,
        )
        assertFalse(
            ChromeCapabilities.of(isRemote = false, pictureInPictureSupported = true, canChangeSpeed = false).speed,
        )
    }
}
