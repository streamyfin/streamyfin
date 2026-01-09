import ExpoModulesCore
import UIKit

public class BackgroundDownloaderAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    if identifier == "com.fredrikburmester.streamyfin.backgrounddownloader" {
      BackgroundDownloaderModule.setBackgroundCompletionHandler(completionHandler)
    }
  }
}

