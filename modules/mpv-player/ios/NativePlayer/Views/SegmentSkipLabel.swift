import Foundation

/// The pill label for a segment type, shared by the phone pill and both TV
/// surfaces. One function so a segment type added later cannot keep the
/// Intro-or-credits branch in one place and miss another — Recap, Commercial
/// and Preview used to read "Skip Credits" on TV.
func segmentSkipLabel(for type: String, _ str: (String, String) -> String) -> String {
	switch type {
	case "Outro": return str("skipCredits", "Skip Outro")
	case "Recap": return str("skipRecap", "Skip Recap")
	case "Commercial": return str("skipCommercial", "Skip Commercial")
	case "Preview": return str("skipPreview", "Skip Preview")
	default: return str("skipIntro", "Skip Intro")
	}
}
