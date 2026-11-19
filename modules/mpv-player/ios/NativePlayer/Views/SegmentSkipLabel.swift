import Foundation

/// The pill label for a segment type, shared by the phone pill and both TV
/// surfaces. One function so a segment type added later cannot keep the
/// Intro-or-credits branch in one place and miss another — Recap, Commercial
/// and Preview used to read "Skip Credits" on TV.
///
/// The fallbacks are the app's English texts (`player.skip_*`), as on Android:
/// they show only when the app sent no string for the key.
func segmentSkipLabel(for type: String, _ str: (String, String) -> String) -> String {
	switch type {
	case "Outro": return str("skipCredits", "Skip credits")
	case "Recap": return str("skipRecap", "Skip recap")
	case "Commercial": return str("skipCommercial", "Skip commercial")
	case "Preview": return str("skipPreview", "Skip preview")
	default: return str("skipIntro", "Skip intro")
	}
}
