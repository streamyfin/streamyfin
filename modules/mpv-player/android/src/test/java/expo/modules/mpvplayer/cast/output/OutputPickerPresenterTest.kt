package expo.modules.mpvplayer.cast.output

import android.os.Looper.getMainLooper
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.ui.platform.ComposeView
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
    @After
    fun dismissLeftovers() {
        OutputPickerPresenter.dismiss()
        OutputPickerPresenter.onDismissed = null
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
