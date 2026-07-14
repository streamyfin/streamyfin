import ExpoModulesCore
#if !os(tvOS)
import Network
import NetworkExtension
import SystemConfiguration.CaptiveNetwork
#endif
import UIKit

public class WifiSsidModule: Module {
  #if !os(tvOS)
  // NWPathMonitor reports whether the active path uses Wi-Fi WITHOUT requiring
  // the wifi-info entitlement, so we can tell "on Wi-Fi but can't read the SSID"
  // apart from "not connected to Wi-Fi" even when fetchCurrent returns nil.
  private let pathMonitor = NWPathMonitor()
  private let monitorQueue = DispatchQueue(label: "expo.modules.wifissid.pathmonitor")
  private let lock = NSLock()
  private var cachedOnWifi = false
  private var pathMonitorStarted = false

  private var isOnWifi: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cachedOnWifi
  }

  private func startPathMonitorIfNeeded() {
    lock.lock()
    if pathMonitorStarted {
      lock.unlock()
      return
    }
    pathMonitorStarted = true
    lock.unlock()

    pathMonitor.pathUpdateHandler = { [weak self] path in
      guard let self else { return }
      let onWifi = path.status == .satisfied && path.usesInterfaceType(.wifi)
      self.lock.lock()
      self.cachedOnWifi = onWifi
      self.lock.unlock()
    }
    pathMonitor.start(queue: monitorQueue)
  }
  #endif

  public func definition() -> ModuleDefinition {
    Name("WifiSsid")

    AsyncFunction("getSSID") { () -> [String: Any] in
      #if os(tvOS)
      return ["ssid": NSNull(), "connectedToWifi": false]
      #else
      self.startPathMonitorIfNeeded()
      let ssid = await self.resolveSSID()
      var result: [String: Any] = ["connectedToWifi": self.isOnWifi]
      if let ssid = ssid {
        result["ssid"] = ssid
      } else {
        result["ssid"] = NSNull()
      }
      return result
      #endif
    }

    Function("getSSIDSync") { () -> [String: Any] in
      #if os(tvOS)
      return ["ssid": NSNull(), "connectedToWifi": false]
      #else
      self.startPathMonitorIfNeeded()
      let ssid = self.getSSIDViaCNCopy()
      var result: [String: Any] = ["connectedToWifi": self.isOnWifi]
      if let ssid = ssid {
        result["ssid"] = ssid
      } else {
        result["ssid"] = NSNull()
      }
      return result
      #endif
    }

    Function("openLocationSettings") {
      #if !os(tvOS)
      DispatchQueue.main.async {
        if let url = URL(string: UIApplication.openSettingsURLString) {
          UIApplication.shared.open(url)
        }
      }
      #endif
    }
  }

  #if !os(tvOS)
  private func resolveSSID() async -> String? {
    await withCheckedContinuation { continuation in
      NEHotspotNetwork.fetchCurrent { network in
        if let ssid = network?.ssid {
          continuation.resume(returning: ssid)
        } else {
          continuation.resume(returning: self.getSSIDViaCNCopy())
        }
      }
    }
  }

  private func getSSIDViaCNCopy() -> String? {
    guard let interfaces = CNCopySupportedInterfaces() as? [String] else {
      return nil
    }

    for interface in interfaces {
      guard let networkInfo = CNCopyCurrentNetworkInfo(interface as CFString) as? [String: Any] else {
        continue
      }

      if let ssid = networkInfo[kCNNetworkInfoKeySSID as String] as? String {
        return ssid
      }
    }

    return nil
  }
  #endif
}
