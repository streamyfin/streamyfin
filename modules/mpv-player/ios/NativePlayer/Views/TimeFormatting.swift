import Foundation

/// "H:MM:SS" over an hour, "M:SS" under. Shared by the iOS touch chrome and
/// the tvOS remote chrome.
func formatTime(_ seconds: Double) -> String {
	guard seconds.isFinite, seconds >= 0 else { return "0:00" }
	let total = Int(seconds.rounded())
	let hours = total / 3600
	let minutes = (total % 3600) / 60
	let secs = total % 60
	if hours > 0 {
		return String(format: "%d:%02d:%02d", hours, minutes, secs)
	}
	return String(format: "%d:%02d", minutes, secs)
}

/// The whole seconds a skip button shows, or nil for a skip-time setting
/// that is not a number.
func seekCount(_ seconds: Double) -> Int? {
	// Int(_: Double) traps on non-finite input; this runs in body, so a
	// bad persisted skip-time setting must degrade, not crash.
	guard let rounded = Int(exactly: seconds.rounded()), rounded >= 0 else { return nil }
	return rounded
}

/// SF Symbols only ship numbered seek glyphs for these intervals.
private let numberedSeekCounts: Set<Int> = [5, 10, 15, 30, 45, 60, 75, 90]

/// "gobackward.30" when SF Symbols has a glyph for exactly that many
/// seconds, nil otherwise: SeekGlyph then draws the number itself.
func numberedSeekSymbol(prefix: String, seconds: Double) -> String? {
	guard let count = seekCount(seconds), numberedSeekCounts.contains(count) else { return nil }
	return "\(prefix).\(count)"
}
