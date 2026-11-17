package expo.modules.mpvplayer.cast

import android.os.Looper.getMainLooper
import com.google.android.gms.cast.CastStatusCodes
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.PendingResult
import com.google.android.gms.common.api.PendingResults
import com.google.android.gms.common.api.Status
import expo.modules.mpvplayer.cast.receiver.ReceiverProtocol
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

// The SDK half of the hub's port, the one place the receiver channel touches a CastSession: what
// the SDK refuses, delivers or answers has to reach the hub as a plain value.
@RunWith(RobolectricTestRunner::class)
class SdkChannelPortTest {
    private val ns = ReceiverProtocol.NAMESPACE

    private fun port(
        setCallbacks: (String, (String) -> Unit) -> Unit = { _, _ -> },
        sendMessage: (String, String) -> PendingResult<Status> = { _, _ ->
            PendingResults.immediatePendingResult(Status(CommonStatusCodes.SUCCESS))
        },
    ) = SdkChannelPort("session-1", { true }, setCallbacks, {}, sendMessage)

    // A session that lost its connection throws instead of taking the callback: the hub has to
    // hear "refused" and leave the namespace free, not crash on the main thread.
    @Test
    fun aRegistrationTheSdkRefusesReportsFalse() {
        assertFalse(port(setCallbacks = { _, _ -> throw IOException("no connection") }).register(ns) {})
        assertFalse(port(setCallbacks = { _, _ -> throw IllegalStateException("not connected") }).register(ns) {})
    }

    @Test
    fun aReceivedMessageIsForwardedUnchanged() {
        var callback: ((String) -> Unit)? = null
        var namespace: String? = null
        val received = mutableListOf<String>()
        port(setCallbacks = { registeredFor, registered ->
            namespace = registeredFor
            callback = registered
        }).register(ns) { received += it }
        val raw = "{\"type\":\"playbackerror\",\"message\":\"NotAllowed\"}"
        callback!!.invoke(raw)
        assertEquals(ns, namespace)
        assertEquals(listOf(raw), received)
    }

    @Test
    fun aFailedSendReportsTheStatusMessage() {
        var error: String? = "not called"
        port(sendMessage = { _, _ ->
            PendingResults.immediatePendingResult(Status(CastStatusCodes.FAILED, "receiver busy"))
        }).send(ns, "x") { error = it }
        shadowOf(getMainLooper()).idle()
        assertEquals("receiver busy", error)
    }

    @Test
    fun aSuccessfulSendReportsNoError() {
        var error: String? = "not called"
        port().send(ns, "x") { error = it }
        shadowOf(getMainLooper()).idle()
        assertNull(error)
    }
}
