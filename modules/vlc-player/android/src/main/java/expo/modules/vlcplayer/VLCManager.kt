package expo.modules.vlcplayer

import expo.modules.core.interfaces.ReactActivityLifecycleListener

// TODO: Creating a separate package class and adding this as a lifecycle listener did not work...
//  https://docs.expo.dev/modules/android-lifecycle-listeners/
object VLCManager: ReactActivityLifecycleListener {
    val listeners: MutableList<ReactActivityLifecycleListener> = mutableListOf()
//    override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
//        listeners.forEach {
//            it.onCreate(activity, savedInstanceState)
//        }
//    }
//
//    override fun onResume(activity: Activity?) {
//        listeners.forEach {
//            it.onResume(activity)
//        }
//    }
//
//    override fun onPause(activity: Activity?) {
//        listeners.forEach {
//            it.onPause(activity)
//        }
//    }
//
//    override fun onUserLeaveHint(activity: Activity?) {
//        listeners.forEach {
//            it.onUserLeaveHint(activity)
//        }
//    }
//
//    override fun onDestroy(activity: Activity?) {
//        listeners.forEach {
//            it.onDestroy(activity)
//        }
//    }
}