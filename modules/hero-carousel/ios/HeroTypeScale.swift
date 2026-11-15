import SwiftUI

/// Turns the font scale cap the app sends into the Dynamic Type size the cards
/// stop at. SwiftUI caps text by size only, so the cap becomes the size whose
/// Caption 1 text (the subtitle and synopsis, the card text that follows
/// Dynamic Type) comes closest to it. Compose applies the same number as is.
enum HeroTypeScale {
  /// Caption 1 in points at each Dynamic Type size, from Apple's Human
  /// Interface Guidelines. 12 at the default size, Large.
  static let caption1PointSizes: [(size: DynamicTypeSize, points: Double)] = [
    (.xSmall, 11), (.small, 11), (.medium, 11), (.large, 12),
    (.xLarge, 14), (.xxLarge, 16), (.xxxLarge, 18),
    (.accessibility1, 22), (.accessibility2, 26), (.accessibility3, 32),
    (.accessibility4, 37), (.accessibility5, 43),
  ]

  /// The largest size the cards follow under `maxFontScale`. Without a cap,
  /// or with one that is not positive, they follow the system's. A scale
  /// halfway between two sizes takes the smaller one.
  static func maxDynamicTypeSize(for maxFontScale: Double?) -> DynamicTypeSize {
    guard let maxFontScale, maxFontScale > 0 else { return .accessibility5 }
    let base = 12.0
    let distance = { (points: Double) in abs(points / base - maxFontScale) }
    var best = caption1PointSizes[0]
    // The margin keeps a tie on the smaller size: 22/12 and 26/12 are both
    // 1/6 from 2.0, but not in floating point.
    for entry in caption1PointSizes.dropFirst()
    where distance(entry.points) < distance(best.points) - 1e-9 {
      best = entry
    }
    return best.size
  }
}
