import Foundation

/// The sheet's texts, from JS (translations/en.json) when JS opens it, with the English fallbacks for a sheet
/// opened from native (the debug probe). The keys of OutputPickerStrings.kt.
struct OutputPickerStrings {
  private let strings: [String: String]

  init(_ strings: [String: String] = [:]) {
    self.strings = strings
  }

  func get(_ key: String) -> String {
    strings[key] ?? Self.fallbacks[key] ?? key
  }

  /// "Play on" with the receiver's name, which the template leaves to native.
  func playOn(_ name: String) -> String {
    get("playOn").replacingOccurrences(of: "{{name}}", with: name)
  }

  func cause(_ cause: FailureCause) -> String {
    switch cause {
    case .deviceGone: return get("deviceGone")
    case .receiverUnavailable: return get("receiverUnavailable")
    case .network: return get("network")
    // The SDK's own text, untranslated and with its code, goes to the log (RemoteTargetHub).
    case .other: return get("failed")
    }
  }

  static let fallbacks: [String: String] = [
    "title": "Play on",
    "thisPhone": "This iPhone",
    "thisTablet": "This iPad",
    "playing": "Playing",
    "continueHere": "Continue here",
    "castCaption": "Chromecast",
    "searching": "Looking for devices",
    "noDevices": "No devices found",
    "playServicesMissing": "Casting needs Google Play services",
    "playServicesUpdate": "Casting needs an update of Google Play services",
    "playServicesAction": "Get it",
    "connecting": "Connecting",
    "cancel": "Cancel",
    "connected": "Chromecast, connected",
    "reconnecting": "Reconnecting",
    "change": "Change",
    "mute": "Mute",
    "unmute": "Unmute",
    "volume": "Volume",
    "remote": "Remote",
    "playOn": "Play on {{name}}",
    "stopPlayback": "Stop playback",
    "disconnect": "Disconnect",
    "deviceGone": "This device is no longer on the network",
    "receiverUnavailable": "The Jellyfin receiver could not start on this device",
    "network": "The connection to this device was lost",
    "failed": "The connection failed",
    "airPlay": "AirPlay…",
    "airPlayCaption": "System picker",
  ]
}
