import AppKit
import Foundation

/// The seek buttons draw Apple's numbered glyph when there is one and the
/// number themselves otherwise. A count listed as numbered with no SF Symbol
/// behind it renders an empty button, the bug this guards against, so the list
/// is checked against the symbols the system actually ships.
@main
enum SeekGlyphTests {
    static func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
        precondition(condition, message())
    }

    static func main() {
        expect(seekCount(20) == 20, "20 s shows 20")
        expect(seekCount(19.6) == 20, "a fractional time rounds")
        expect(seekCount(0) == 0, "0 s shows 0")
        expect(seekCount(-0.4) == nil, "a negative time shows no number, even one that rounds to 0")
        expect(seekCount(.nan) == nil, "NaN shows no number")
        expect(seekCount(.infinity) == nil, "infinity shows no number")

        for count in stride(from: 0, through: 120, by: 5) {
            for prefix in ["gobackward", "goforward"] {
                let symbol = "\(prefix).\(count)"
                let shipped = NSImage(systemSymbolName: symbol, accessibilityDescription: nil) != nil
                let picked = numberedSeekSymbol(prefix: prefix, seconds: Double(count))
                expect(
                    picked == (shipped ? symbol : nil),
                    "\(symbol): SF Symbols \(shipped ? "has" : "lacks") it, numberedSeekSymbol gave \(picked ?? "nil")"
                )
            }
        }
        print("SeekGlyph tests passed")
    }
}
