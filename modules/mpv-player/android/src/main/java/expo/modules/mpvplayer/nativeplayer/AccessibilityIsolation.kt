package expo.modules.mpvplayer.nativeplayer

import android.app.Activity
import android.view.View
import android.view.ViewGroup

/**
 * The app under a player stays in the accessibility tree otherwise: TalkBack and uiautomator would reach its
 * hidden buttons, the header's Cast button among them, named as the player's. Views added later, the output
 * sheet's, stay reachable.
 */
internal class AccessibilityIsolation {
    private val hidden = mutableListOf<Pair<View, Int>>()

    /** Hides what the activity's content holds now, the player's own view excepted since it comes after. */
    fun hideAppOf(activity: Activity) {
        val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        for (index in 0 until content.childCount) {
            val view = content.getChildAt(index)
            hidden += view to view.importantForAccessibility
            view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        }
    }

    fun restore() {
        for ((view, importance) in hidden) view.importantForAccessibility = importance
        hidden.clear()
    }
}
