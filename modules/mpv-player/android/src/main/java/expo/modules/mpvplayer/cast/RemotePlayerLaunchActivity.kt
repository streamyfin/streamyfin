package expo.modules.mpvplayer.cast

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * The Cast notification's target: brings the app to the front as its launcher icon does, asks JS for the remote
 * player and finishes, without drawing anything (a NoDisplay theme in the module manifest). The app's own activity
 * is not known to the module, so it is found through the launch intent.
 */
class RemotePlayerLaunchActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val launch = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(packageName)
        startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED))
        RemotePlayerRequests.request()
        finish()
    }
}
