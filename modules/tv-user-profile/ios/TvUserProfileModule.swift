import ExpoModulesCore
#if os(tvOS)
import TVServices
#endif

public class TvUserProfileModule: Module {
  #if os(tvOS)
  private let userManager = TVUserManager()
  private var profileObservation: NSKeyValueObservation?
  #endif

  public func definition() -> ModuleDefinition {
    Name("TvUserProfile")

    // Define event that can be sent to JavaScript
    Events("onProfileChange")

    // Get current tvOS profile identifier
    Function("getCurrentProfileId") { () -> String? in
      #if os(tvOS)
      let identifier = self.userManager.currentUserIdentifier
      print("[TvUserProfile] Current profile ID: \(identifier ?? "nil")")
      return identifier
      #else
      return nil
      #endif
    }

    // Check if running on tvOS with profile support
    Function("isProfileSwitchingSupported") { () -> Bool in
      #if os(tvOS)
      return true
      #else
      return false
      #endif
    }

    OnCreate {
      #if os(tvOS)
      self.setupProfileObserver()
      #endif
    }

    OnDestroy {
      #if os(tvOS)
      self.profileObservation?.invalidate()
      self.profileObservation = nil
      #endif
    }
  }

  #if os(tvOS)
  private func setupProfileObserver() {
    // Debug: Print all available info about TVUserManager
    print("[TvUserProfile] TVUserManager created")
    print("[TvUserProfile] currentUserIdentifier: \(userManager.currentUserIdentifier ?? "nil")")
    if #available(tvOS 16.0, *) {
      print("[TvUserProfile] shouldStorePreferencesForCurrentUser: \(userManager.shouldStorePreferencesForCurrentUser)")
    }

    // Set up KVO observation on currentUserIdentifier
    profileObservation = userManager.observe(\.currentUserIdentifier, options: [.new, .old, .initial]) { [weak self] manager, change in
      guard let self = self else { return }

      let newProfileId = change.newValue ?? nil
      let oldProfileId = change.oldValue ?? nil

      print("[TvUserProfile] KVO fired - old: \(oldProfileId ?? "nil"), new: \(newProfileId ?? "nil")")

      // Only send event if the profile actually changed
      if newProfileId != oldProfileId {
        print("[TvUserProfile] Profile changed from \(oldProfileId ?? "nil") to \(newProfileId ?? "nil")")
        self.sendEvent("onProfileChange", [
          "profileId": newProfileId as Any
        ])
      }
    }

    print("[TvUserProfile] Profile observer set up successfully")
  }
  #endif
}
