import Foundation

/// The TV control bar and skip pill used to branch on Intro-or-credits, so a
/// Recap, Commercial or Preview segment read "Skip Credits". These cases pin
/// the shared mapping every surface now calls: the key each type reads, and
/// the English text it falls back to when the app sent none.
@main
enum SegmentSkipLabelTests {
    static func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
        precondition(condition, message())
    }

    /// Echoes the key and the fallback, so the test sees both.
    static func both(_ key: String, _ fallback: String) -> String { "\(key)|\(fallback)" }

    static func main() {
        expect(
            segmentSkipLabel(for: "Recap", both) == "skipRecap|Skip recap",
            "a recap reads its own label, not the credits one"
        )
        expect(
            segmentSkipLabel(for: "Commercial", both) == "skipCommercial|Skip commercial",
            "a commercial reads its own label"
        )
        expect(
            segmentSkipLabel(for: "Preview", both) == "skipPreview|Skip preview",
            "a preview reads its own label"
        )
        expect(
            segmentSkipLabel(for: "Outro", both) == "skipCredits|Skip credits",
            "an outro keeps the credits label, with the text Android and the app use"
        )
        expect(segmentSkipLabel(for: "Intro", both) == "skipIntro|Skip intro", "an intro reads the intro label")
        expect(
            segmentSkipLabel(for: "SomethingNew", both) == "skipIntro|Skip intro",
            "an unknown type falls back to the intro label"
        )
        print("SegmentSkipLabel tests passed")
    }
}
