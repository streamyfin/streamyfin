package expo.modules.mpvplayer.cast.output

import android.os.Looper.getMainLooper
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.ui.platform.ComposeView
import com.google.android.gms.common.ConnectionResult
import expo.modules.mpvplayer.cast.target.FakeTargetPort
import expo.modules.mpvplayer.cast.target.RemoteTargetHub
import expo.modules.mpvplayer.cast.target.TargetDevice
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

// The sheet lives on the activity it was presented over. The system recreates that activity on a change
// the manifest does not handle, a font size among them: the sheet has to go with it, or the presenter
// keeps a sheet shown nowhere and never presents another. Robolectric's manifest lacks the Play Services
// version, so the services check throws here as it can on a device: the sheet still opens.
@RunWith(RobolectricTestRunner::class)
class OutputPickerPresenterTest {
    private val livingRoom = TargetDevice("device-a", "Living room")

    @After
    fun dismissLeftovers() {
        OutputPickerPresenter.dismiss()
        OutputPickerPresenter.onDismissed = null
        OutputPickerPresenter.currentActivity = { null }
        OutputPickerPresenter.checkPlayServices = OutputPickerPresenter.defaultCheckPlayServices
        OutputPickerPresenter.resolvePlayServices = OutputPickerPresenter.defaultResolvePlayServices
        OutputPickerPresenter.receiverTitle = { null }
        OutputPickerPresenter.receiverPlaying = { false }
        OutputPickerPresenter.onPlayServicesAvailable = {}
    }

    private fun sheetIn(activity: ComponentActivity): Boolean {
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        return (0 until content.childCount).any { content.getChildAt(it) is ComposeView }
    }

    @Test
    fun aDestroyedActivityTakesTheSheetWithIt() {
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        var dismissed = 0
        OutputPickerPresenter.onDismissed = { dismissed++ }
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null) {}

        screen.pause().stop().destroy()
        shadowOf(getMainLooper()).idle()

        assertFalse(OutputPickerPresenter.isPresented)
        assertEquals(1, dismissed)
    }

    // The remote opens over the screen, once the sheet is gone, as on iOS.
    @Test
    fun theRemoteIsAskedForOnceTheSheetIsGone() {
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        var presentedAtTheRemote: Boolean? = null
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null) {
            presentedAtTheRemote = OutputPickerPresenter.isPresented
        }

        OutputPickerPresenter.presentedController?.remote()

        assertEquals(false, presentedAtTheRemote)
    }

    // The player's video goes to the TV once the sheet is gone, as the remote does.
    @Test
    fun aHandOffClosesTheSheetThenCallsBack() {
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        var presentedAtTheHandOff: Boolean? = null
        OutputPickerPresenter.present(
            screen.get(),
            anchor = null,
            playingHere = null,
            handOff = true,
            onHandOff = { presentedAtTheHandOff = OutputPickerPresenter.isPresented },
        ) {}
        val handOff = OutputPickerPresenter.presentedController?.environment?.handOff

        OutputPickerPresenter.presentedController?.handOff()
        // Posted: the SDK's session listeners run one after the other, the module's own caching the session JS reads.
        val calledAtOnce = presentedAtTheHandOff != null
        shadowOf(getMainLooper()).idle()

        assertEquals(true, handOff)
        assertEquals(false, calledAtOnce)
        assertEquals(false, presentedAtTheHandOff)
    }

    private fun connectFromThePlayerSheet(port: FakeTargetPort, handOffs: () -> Unit) {
        RemoteTargetHub.shared.install(port)
        OutputPickerPresenter.checkPlayServices = { ConnectionResult.SUCCESS }
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null, handOff = true, onHandOff = handOffs) {}
        val sheet = OutputPickerPresenter.presentedController!!
        sheet.tap((sheet.state as OutputSheetState.List).rows.filterIsInstance<OutputRow.Device>().first { it.id == livingRoom.id })
    }

    // The player's sheet closed while the receiver it asked for connects: the video still goes once it is connected.
    @Test
    fun aSheetClosedWhileItsReceiverConnectsStillHandsOff() {
        val port = FakeTargetPort(known = listOf(livingRoom), listsOnDiscovery = true)
        var handOffs = 0
        connectFromThePlayerSheet(port) { handOffs++ }

        OutputPickerPresenter.dismiss()
        port.emit("started", livingRoom)
        shadowOf(getMainLooper()).idle()

        assertEquals(1, handOffs)
    }

    // The player closing takes its sheet, and a hand-off still waiting for its receiver, with it.
    @Test
    fun aSheetClosedWithThePlayerHandsNothingOff() {
        val port = FakeTargetPort(known = listOf(livingRoom), listsOnDiscovery = true)
        var handOffs = 0
        connectFromThePlayerSheet(port) { handOffs++ }

        OutputPickerPresenter.dismissPlayerSheet()
        port.emit("started", livingRoom)
        shadowOf(getMainLooper()).idle()

        assertFalse(OutputPickerPresenter.isPresented)
        assertEquals(0, handOffs)
    }

    // The app's own sheet stays: only the player's goes with the player.
    @Test
    fun aClosingPlayerLeavesTheAppsSheet() {
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null) {}

        OutputPickerPresenter.dismissPlayerSheet()

        assertTrue(OutputPickerPresenter.isPresented)
    }

    // The probe's sheet never takes over one the app opened: the app's remote still answers, and its track stays.
    @Test
    fun theProbeLeavesASheetTheAppOpened() {
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        OutputPickerPresenter.currentActivity = { screen.get() }
        var remote = 0
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = "Bonus 1") { remote++ }

        OutputPickerPresenter.presentForProbe()
        val playingHere = OutputPickerPresenter.presentedController?.environment?.playingHere
        OutputPickerPresenter.presentedController?.remote()

        assertEquals("Bonus 1", playingHere)
        assertEquals(1, remote)
    }

    // A rotation moves the header button: the popover follows its view, not the frame it had when it opened.
    @Test
    fun theAnchoredPopoverFollowsItsButton() {
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        val button = View(screen.get())
        screen.get().addContentView(button, ViewGroup.LayoutParams(40, 40))
        shadowOf(getMainLooper()).idle()
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null, anchorView = button) {}
        val before = OutputPickerPresenter.presentedAnchor

        button.offsetLeftAndRight(100)
        button.viewTreeObserver.dispatchOnGlobalLayout()
        val after = OutputPickerPresenter.presentedAnchor

        assertEquals(40, before?.width)
        assertEquals(100, (after?.left ?: 0) - (before?.left ?: 0))
    }

    // Back from the Play Store, the services may be there now: the sheet checks them again.
    @Test
    fun theServicesAreCheckedAgainWhenTheScreenComesBack() {
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        OutputPickerPresenter.checkPlayServices = { ConnectionResult.SERVICE_MISSING }
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null) {}
        val before = OutputPickerPresenter.presentedController?.environment?.playServices

        OutputPickerPresenter.checkPlayServices = { ConnectionResult.SUCCESS }
        screen.pause().resume()

        assertEquals(PlayServicesStatus.MISSING, before)
        assertEquals(PlayServicesStatus.AVAILABLE, OutputPickerPresenter.presentedController?.environment?.playServices)
    }

    // Installed from the sheet, the services start no Cast context on their own: the module starts it, and the
    // open sheet finds the receivers without being opened again.
    @Test
    fun servicesThatCameBackStartTheCastContext() {
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        var started = 0
        OutputPickerPresenter.onPlayServicesAvailable = { started++ }
        OutputPickerPresenter.checkPlayServices = { ConnectionResult.SERVICE_MISSING }
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null) {}

        screen.pause().resume()
        OutputPickerPresenter.checkPlayServices = { ConnectionResult.SUCCESS }
        screen.pause().resume()
        screen.pause().resume()

        assertEquals(1, started)
    }

    // A session that ends, or starts, changes what the receiver plays before any media status says so: the open
    // panel reads it again, instead of offering to stop what the receiver no longer plays.
    @Test
    fun aSessionEndReadsWhatTheReceiverPlaysAgain() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        RemoteTargetHub.shared.install(port)
        port.emit("started", livingRoom)
        var title: String? = "Big Buck Bunny"
        OutputPickerPresenter.receiverTitle = { title }
        OutputPickerPresenter.receiverPlaying = { title != null }
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null) {}

        title = null
        port.emit("ended", livingRoom)

        assertEquals(null, OutputPickerPresenter.presentedController?.environment?.receiverTitle)
        assertEquals(false, OutputPickerPresenter.presentedController?.environment?.receiverPlaying)
    }

    // The services' dialog runs the same check, which throws where the manifest lacks their version.
    @Test
    fun getItSurvivesAServicesCheckThatThrows() {
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        OutputPickerPresenter.checkPlayServices = { ConnectionResult.SERVICE_MISSING }
        OutputPickerPresenter.resolvePlayServices = { throw IllegalStateException("no Play Services version in the manifest") }
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null) {}

        OutputPickerPresenter.presentedController?.tap(OutputRow.Status(SheetStatus.PLAY_SERVICES_MISSING))

        assertTrue(OutputPickerPresenter.isPresented)
    }

    // An active scan costs battery: out of sight, the open sheet stops looking, and looks again on its return.
    @Test
    fun theSheetStopsDiscoveringWhileTheScreenIsOutOfSight() {
        val port = FakeTargetPort()
        RemoteTargetHub.shared.install(port)
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null) {}
        val looking = port.discovering

        screen.pause().stop()
        val outOfSight = port.discovering
        screen.restart().start().resume()

        assertTrue(looking)
        assertFalse(outOfSight)
        assertTrue(port.discovering)
    }

    @Test
    fun aSheetAskedForAfterARecreationShowsOnTheNewActivity() {
        val screen = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null) {}

        screen.recreate()
        // Left undrawn: Material reads resources these tests do not load, and the view is what counts here.
        val presented = OutputPickerPresenter.present(screen.get(), anchor = null, playingHere = null) {}

        assertTrue(presented)
        assertTrue(sheetIn(screen.get()))
    }
}
