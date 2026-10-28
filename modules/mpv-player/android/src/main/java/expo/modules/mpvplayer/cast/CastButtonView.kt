package expo.modules.mpvplayer.cast

import android.content.Context
import android.graphics.Color
import android.view.ContextThemeWrapper
import android.view.ViewGroup
import androidx.core.graphics.drawable.DrawableCompat
import androidx.mediarouter.app.MediaRouteButton
import com.google.android.gms.cast.framework.CastButtonFactory
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * The SDK's own Cast button: it shows the connection state and opens the system Cast
 * dialog. It stays until the output sheet of the remote playback work replaces it.
 * MediaRouteButton inflates its drawables from an AppCompat theme, which a React view's
 * context does not carry, hence the wrapper.
 */
class CastButtonView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val themedContext = ContextThemeWrapper(context, androidx.appcompat.R.style.Theme_AppCompat_DayNight)
    private val button = MediaRouteButton(themedContext)

    init {
        addView(button, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        if (CastSupport.isAvailable(context)) {
            CastButtonFactory.setUpMediaRouteButton(context.applicationContext, button)
        }
    }

    fun setTintColor(color: String?) {
        if (color == null) return
        // The indicator drawable comes from the MediaRouter theme; tinting a fresh copy keeps the theme's one intact.
        val attributes = themedContext.obtainStyledAttributes(
            null,
            androidx.mediarouter.R.styleable.MediaRouteButton,
            androidx.mediarouter.R.attr.mediaRouteButtonStyle,
            0,
        )
        val drawable = attributes.getDrawable(androidx.mediarouter.R.styleable.MediaRouteButton_externalRouteEnabledDrawable)
        attributes.recycle()
        val tinted = DrawableCompat.wrap(drawable ?: return).mutate()
        DrawableCompat.setTint(tinted, Color.parseColor(color))
        button.setRemoteIndicatorDrawable(tinted)
    }
}
