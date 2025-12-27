package expo.modules.sfplayer

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class SfPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    
    private val placeholder: View = View(context).apply {
        setBackgroundColor(android.graphics.Color.BLACK)
        layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
    }

    init {
        addView(placeholder)
    }
}







