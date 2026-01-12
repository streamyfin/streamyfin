import ExpoModulesCore
import NetworkExtension
import SystemConfiguration.CaptiveNetwork

public class WifiSsidModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WifiSsid")

    // Get current WiFi SSID using NEHotspotNetwork (iOS 14+)
    AsyncFunction("getSSID") { () -> String? in
      return await withCheckedContinuation { continuation in
        NEHotspotNetwork.fetchCurrent { network in
          if let ssid = network?.ssid {
            print("[WifiSsid] Got SSID via NEHotspotNetwork: \(ssid)")
            continuation.resume(returning: ssid)
          } else {
            // Fallback to CNCopyCurrentNetworkInfo for older iOS
            print("[WifiSsid] NEHotspotNetwork returned nil, trying CNCopyCurrentNetworkInfo")
            let ssid = self.getSSIDViaCNCopy()
            continuation.resume(returning: ssid)
          }
        }
      }
    }

    // Synchronous version using only CNCopyCurrentNetworkInfo
    Function("getSSIDSync") { () -> String? in
      return self.getSSIDViaCNCopy()
    }
  }

  private func getSSIDViaCNCopy() -> String? {
    guard let interfaces = CNCopySupportedInterfaces() as? [String] else {
      print("[WifiSsid] CNCopySupportedInterfaces returned nil")
      return nil
    }

    for interface in interfaces {
      guard let networkInfo = CNCopyCurrentNetworkInfo(interface as CFString) as? [String: Any] else {
        continue
      }

      if let ssid = networkInfo[kCNNetworkInfoKeySSID as String] as? String {
        print("[WifiSsid] Got SSID via CNCopyCurrentNetworkInfo: \(ssid)")
        return ssid
      }
    }

    print("[WifiSsid] No SSID found via CNCopyCurrentNetworkInfo")
    return nil
  }
}
