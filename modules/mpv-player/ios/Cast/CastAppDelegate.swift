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
    GCKCastContext.sharedInstance().useDefaultExpandedMediaControls = CastMapping.useDefaultExpandedMediaControls
  }
}

public class CastAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    CastContextBootstrap.initializeIfNeeded()
    #if DEBUG
    // The device proof of the Cast engine, armed by `-CastEngineProbe YES` at launch.
    if UserDefaults.standard.bool(forKey: CastEngineProbeScript.launchArgument) { CastEngineProbe.arm() }
    // The device proof of the remote target, armed by `-CastTargetProbe <part of a receiver's name>`
    // (`-CastTargetProbeKeep YES` leaves the session up, `-CastTargetProbeHold <ms>` holds it longer,
    // `-CastTargetProbeBack YES` asks the receiver a switch leaves again before its session ends).
    if let name = UserDefaults.standard.string(forKey: CastTargetProbe.launchArgument), !name.isEmpty {
      let keep = UserDefaults.standard.bool(forKey: CastTargetProbe.keepArgument)
      let hold = UserDefaults.standard.double(forKey: CastTargetProbe.holdArgument)
      let holdMs = hold > 0 ? hold : CastTargetProbe.connectedHoldMs
      let next = UserDefaults.standard.string(forKey: CastTargetProbe.thenArgument)
      let back = UserDefaults.standard.bool(forKey: CastTargetProbe.backArgument)
      DispatchQueue.main.async { CastTargetProbe.run(deviceName: name, keep: keep, holdMs: holdMs, then: next, back: back) }
    }
    #endif
    return true
  }
}
#else
/// tvOS and Catalyst carry no Cast: the subscriber exists for the module config, and does nothing.
public class CastAppDelegate: ExpoAppDelegateSubscriber {}
#endif
