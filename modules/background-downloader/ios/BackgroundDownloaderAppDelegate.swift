import ExpoModulesCore
import UIKit
import os

public class BackgroundDownloaderAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    backgroundDownloaderLog.info(
      "handleEventsForBackgroundURLSession received for \(identifier, privacy: .public)"
    )
    if identifier == "com.fredrikburmester.streamyfin.backgrounddownloader" {
      BackgroundDownloaderModule.setBackgroundCompletionHandler(completionHandler)
    }
  }
}

