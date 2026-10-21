import ExpoModulesCore
import ExpoNotifications
import UIKit
import UserNotifications

/**
 Registers with expo-notifications as soon as the app launches. A tap on the app's
 notification settings link in the iOS Settings can launch the app, and iOS tells its
 delegate before any JavaScript runs, so the tap is kept until the app asks for it.
 */
public class NotificationSettingsLinkAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    NotificationCenterManager.shared.addDelegate(SettingsLinkRelay.shared)
    return true
  }
}

/// Receives the settings tap from expo-notifications and hands it to the module.
final class SettingsLinkRelay: NSObject, NotificationDelegate {
  static let shared = SettingsLinkRelay()

  private let lock = NSLock()
  private var pending = false
  private var listener: (() -> Void)?

  func openSettings(_ notification: UNNotification?) {
    lock.lock()
    let deliver = listener
    if deliver == nil { pending = true }
    lock.unlock()
    if let deliver { DispatchQueue.main.async { deliver() } }
  }

  /// Whether a tap arrived before anyone listened, forgotten once read.
  func takePending() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    let was = pending
    pending = false
    return was
  }

  /// Who is told of the next taps, or nobody, in which case a tap is kept as pending.
  func listen(_ newListener: (() -> Void)?) {
    lock.lock()
    listener = newListener
    lock.unlock()
  }
}
