import ExpoModulesCore
import UIKit

#if os(iOS) && !targetEnvironment(macCatalyst)
import GoogleCast

/// The Cast context, created once at launch and before any JS runs: the SDK resumes a saved
/// session on its own, and the module's listeners have to find the context there.
enum CastContextBootstrap {
  static func initializeIfNeeded() {
    guard !GCKCastContext.isSharedInstanceInitialized() else { return }
    let receiverId = CastMapping.receiverAppId(fromInfoPlist: Bundle.main.infoDictionary ?? [:])
    let options = GCKCastOptions(discoveryCriteria: GCKDiscoveryCriteria(applicationID: receiverId))
    // A stop from this phone closes the receiver app too, as Android does; the stop reporter
    // relies on it to tell a user's stop from a lost connection.
    options.stopReceiverApplicationWhenEndingSession = true
    options.startDiscoveryAfterFirstTapOnCastButton = true
    options.suspendSessionsWhenBackgrounded = true
    GCKCastContext.setSharedInstanceWith(options)
    // The expanded controls are presented on request, not whenever a session starts.
    GCKCastContext.sharedInstance().useDefaultExpandedMediaControls = false
  }
}

public class CastAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    CastContextBootstrap.initializeIfNeeded()
    return true
  }
}
#else
/// tvOS and Catalyst carry no Cast: the subscriber exists for the module config, and does nothing.
public class CastAppDelegate: ExpoAppDelegateSubscriber {}
#endif
