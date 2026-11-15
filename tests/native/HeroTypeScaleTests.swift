import SwiftUI

/// SwiftUI caps text by Dynamic Type size, not by a factor, so the hero turns
/// the font scale cap the app sends into a size. The cap is 1.3, and before
/// this check the cards stopped at .xxxLarge, whose captions grow 1.5 times and
/// still cut the last badge on a 375 point iPhone.
@main
enum HeroTypeScaleTests {
    static func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
        precondition(condition, message())
    }

    static func cap(_ scale: Double?) -> DynamicTypeSize {
        HeroTypeScale.maxDynamicTypeSize(for: scale)
    }

    static func main() {
        expect(cap(1.3) == .xxLarge, "1.3 stops at xxLarge, whose captions grow 1.33 times, got \(cap(1.3))")
        expect(cap(1.0) == .large, "1.0 stops at the default size, got \(cap(1.0))")
        expect(cap(1.5) == .xxxLarge, "1.5 stops at xxxLarge, got \(cap(1.5))")
        expect(cap(2.0) == .accessibility1, "2.0 falls between AX1 and AX2 and takes the smaller, got \(cap(2.0))")
        expect(cap(10) == .accessibility5, "a scale past every size stops at the largest, got \(cap(10))")
        expect(cap(nil) == .accessibility5, "no cap follows the system's size, got \(cap(nil))")
        expect(cap(0) == .accessibility5, "a cap of zero is ignored, got \(cap(0))")
        expect(cap(-1) == .accessibility5, "a negative cap is ignored, got \(cap(-1))")

        let sizes = HeroTypeScale.caption1PointSizes.map(\.size)
        expect(sizes == DynamicTypeSize.allCases, "the table lists every Dynamic Type size in order")
        expect(
            HeroTypeScale.caption1PointSizes.first { $0.size == .large }?.points == 12,
            "Caption 1 is 12 points at the default size"
        )
        print("HeroTypeScale tests passed")
    }
}
