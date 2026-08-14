package expo.modules.mpvplayer.nativeplayer

import android.content.Context
import android.view.KeyEvent
import android.view.View
import android.widget.FrameLayout

class TvOverlayContainer(
    context: Context,
    private val keyHandler: TvRemoteKeyHandler
) : FrameLayout(context) {

    init {
        isFocusable = true
        isFocusableInTouchMode = true
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (keyHandler.intercept(event)) {
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun focusSearch(focused: View?, direction: Int): View? {
        val next = super.focusSearch(focused, direction)
        // If focus would escape outside this overlay container into background RN views,
        // keep focus pinned inside this container.
        if (next == null || !isDescendantOf(next, this)) {
            return focused ?: this
        }
        return next
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        requestFocus()
    }

    fun onZoneChanged(zone: TvFocusZone) {
        if (zone == TvFocusZone.NONE) {
            requestFocus()
        }
    }

    private fun isDescendantOf(child: View, parent: View): Boolean {
        var p = child.parent
        while (p != null) {
            if (p === parent) return true
            p = p.parent
        }
        return false
    }
}
