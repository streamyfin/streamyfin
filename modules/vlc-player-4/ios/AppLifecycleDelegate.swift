import ExpoModulesCore

protocol SimpleAppLifecycleListener {
    func applicationDidEnterBackground() -> Void
    func applicationDidEnterForeground() -> Void
}

public class AppLifecycleDelegate: ExpoAppDelegateSubscriber {
  public func applicationDidBecomeActive(_ application: UIApplication) {
    // The app has become active.
  }

  public func applicationWillResignActive(_ application: UIApplication) {
    // The app is about to become inactive.
  }

  public func applicationDidEnterBackground(_ application: UIApplication) {
    VLCManager.shared.listeners.forEach { listener in
        listener.applicationDidEnterBackground()
    }
  }

  public func applicationWillEnterForeground(_ application: UIApplication) {
        VLCManager.shared.listeners.forEach { listener in
            listener.applicationDidEnterForeground()
        }
  }

  public func applicationWillTerminate(_ application: UIApplication) {
    // The app is about to terminate.
  }
}
