import Foundation

/// The TV control bar and skip pill used to branch on Intro-or-credits, so a
/// Recap, Commercial or Preview segment read "Skip Credits". These cases pin
/// the shared mapping every surface now calls.
@main
enum SegmentSkipLabelTests {
    static func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
        precondition(condition, message())
    }

    /// Echoes the key so the test can see which label was chosen.
    static func key(_ key: String, _ fallback: String) -> String { key }

    static func main() {
        expect(segmentSkipLabel(for: "Recap", key) == "skipRecap", "Recap has its own label")
        expect(
            segmentSkipLabel(for: "Commercial", key) == "skipCommercial",
            "Commercial has its own label"
        )
        expect(segmentSkipLabel(for: "Preview", key) == "skipPreview", "Preview has its own label")
        expect(segmentSkipLabel(for: "Outro", key) == "skipCredits", "Outro keeps the credits label")
        expect(segmentSkipLabel(for: "Intro", key) == "skipIntro", "Intro is the intro label")
        expect(
            segmentSkipLabel(for: "SomethingNew", key) == "skipIntro",
            "an unknown type falls back to the intro label"
        )
        print("SegmentSkipLabel tests passed")
    }
}
