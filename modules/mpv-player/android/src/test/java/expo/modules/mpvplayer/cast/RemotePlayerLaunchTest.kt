package expo.modules.mpvplayer.cast

import android.content.Intent
import expo.modules.mpvplayer.nativeplayer.NativePlayerSession
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

// The remote player replaces the SDK's expanded controls: every native entry that opened them asks JS for it.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RemotePlayerLaunchTest {
    @Before
    @After
    fun forgetRequests() {
        RemotePlayerRequests.consume()
    }

    @Test
    fun theNotificationOpensTheAppAndAsksForTheRemotePlayer() {
        val options = CastOptionsProvider.mediaOptions()
        assertEquals(RemotePlayerLaunchActivity::class.java.name, options.notificationOptions?.targetActivityClassName)
        assertNull(options.expandedControllerActivityClassName)

        val activity = Robolectric.buildActivity(RemotePlayerLaunchActivity::class.java).create().get()

        val started = shadowOf(activity).nextStartedActivity
        assertEquals(activity.packageName, started.`package` ?: started.component?.packageName)
        assertEquals(Intent.ACTION_MAIN, started.action)
        assertTrue(started.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        assertTrue(activity.isFinishing)
        assertTrue(RemotePlayerRequests.consume())
    }

    // The SDK opens it through TaskStackBuilder, which adds NEW_TASK | CLEAR_TASK | TASK_ON_HOME: in the app's own task
    // that clear destroys MainActivity and restarts the app from its first screen. A task of its own is emptied instead,
    // and the launch intent brings the app's task to the front as it was.
    @Test
    fun theNotificationsTargetRunsInATaskOfItsOwn() {
        // Robolectric does not read the module's manifest (no includeAndroidResources): the source is parsed.
        val android = "http://schemas.android.com/apk/res/android"
        val manifest = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
            .newDocumentBuilder().parse(File("src/main/AndroidManifest.xml"))
        val activities = manifest.getElementsByTagName("activity")
        val trampoline = (0 until activities.length).map { activities.item(it) as Element }
            .single { it.getAttributeNS(android, "name") == RemotePlayerLaunchActivity::class.java.name }

        assertTrue(trampoline.hasAttributeNS(android, "taskAffinity"))
        assertEquals("", trampoline.getAttributeNS(android, "taskAffinity"))
        assertEquals("true", trampoline.getAttributeNS(android, "excludeFromRecents"))
    }

    // The app started from the notification: JS listens only once it has loaded, the request waits for its mount.
    // A module gone with a JS reload no longer hears one either.
    @Test
    fun aRequestMadeBeforeJsListensIsKept() {
        var heard = 0
        val stop = RemotePlayerRequests.listen { heard++ }
        stop()

        RemotePlayerRequests.request()

        assertEquals(0, heard)
        assertTrue(RemotePlayerRequests.consume())
    }

    // The event and the mount both ask for it: only one of them opens the player.
    @Test
    fun aKeptRequestIsGivenOnce() {
        var heard = 0
        val stop = RemotePlayerRequests.listen { heard++ }

        RemotePlayerRequests.request()

        assertEquals(1, heard)
        assertTrue(RemotePlayerRequests.consume())
        assertFalse(RemotePlayerRequests.consume())
        stop()
    }

    // Remote in the local player's sheet: the module refuses the remote player over the local one, so the request
    // goes once the local player is gone.
    @Test
    fun theLocalPlayersRemoteClosesItBeforeAskingForTheRemotePlayer() {
        val events = mutableListOf<String>()
        val session = NativePlayerSession(
            emit = { name, payload -> if (name == "onDismiss") events += "dismiss:${payload["reason"]}" },
            onTornDown = { events += "tornDown" },
            presenterProvider = { null },
        )
        val stop = RemotePlayerRequests.listen { events += "requested" }

        session.openRemotePlayer()

        assertEquals(listOf("dismiss:closeButton", "tornDown", "requested"), events)
        assertTrue(RemotePlayerRequests.consume())
        stop()
    }
}
