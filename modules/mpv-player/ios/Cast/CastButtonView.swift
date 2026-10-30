import ExpoModulesCore
import UIKit

#if os(iOS) && !targetEnvironment(macCatalyst)
import GoogleCast

/// The SDK's own Cast button: it shows the connection state and opens the system Cast
/// dialog. It stays until the output sheet of the remote playback work replaces it.
class CastButtonView: ExpoView {
  private static let side: CGFloat = 24
  private let button = GCKUICastButton(frame: CGRect(x: 0, y: 0, width: side, height: side))

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addSubview(button)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    button.frame = bounds
  }

  // A native view inside a React layout needs a size of its own, or it collapses to zero.
  override var intrinsicContentSize: CGSize {
    CGSize(width: Self.side, height: Self.side)
  }

  func setTintColor(_ color: String?) {
    guard let color, let parsed = UIColor(cssHex: color) else { return }
    button.tintColor = parsed
  }
}

extension UIColor {
  /// `#RGB`, `#RRGGBB` or `#RRGGBBAA`, as React Native hands a string color prop over.
  convenience init?(cssHex: String) {
    var hex = cssHex.trimmingCharacters(in: .whitespacesAndNewlines)
    if hex.lowercased() == "transparent" {
      self.init(white: 0, alpha: 0)
      return
    }
    guard hex.hasPrefix("#") else { return nil }
    hex.removeFirst()
    if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
    guard hex.count == 6 || hex.count == 8, let value = UInt64(hex, radix: 16) else { return nil }
    let hasAlpha = hex.count == 8
    let red = CGFloat((value >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
    let green = CGFloat((value >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
    let blue = CGFloat((value >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
    let alpha = hasAlpha ? CGFloat(value & 0xFF) / 255 : 1
    self.init(red: red, green: green, blue: blue, alpha: alpha)
  }
}
#else
/// tvOS and Catalyst carry no Cast: an empty view keeps the module's view registration valid.
class CastButtonView: ExpoView {
  func setTintColor(_ color: String?) {}
}
#endif
