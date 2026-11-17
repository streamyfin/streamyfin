package expo.modules.mpvplayer.cast

import android.view.Menu
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.media.widget.ExpandedControllerActivity
import expo.modules.mpvplayer.R

/**
 * The SDK's full screen controls, declared in the module manifest and named in the Cast
 * options. The toolbar carries the Cast button, whose dialog is where casting stops from
 * this screen; the SDK does not add it on its own. The native chrome's remote mode
 * replaces the whole screen later.
 */
class CastExpandedControllerActivity : ExpandedControllerActivity() {
    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        super.onCreateOptionsMenu(menu)
        menuInflater.inflate(R.menu.cast_expanded_controller, menu)
        CastButtonFactory.setUpMediaRouteButton(applicationContext, menu, R.id.media_route_menu_item)
        return true
    }
}
