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

/// SF Symbols only ship numbered seek glyphs for specific intervals. Shared
/// by the center transport buttons and the double-tap seek feedback pill.
func seekSymbol(prefix: String, seconds: Double) -> String {
	let supported: Set<Int> = [5, 10, 15, 30, 45, 60, 75, 90]
	// Int(_: Double) traps on non-finite input; this runs in body, so a
	// bad persisted skip-time setting must degrade, not crash.
	guard let rounded = Int(exactly: seconds.rounded()) else { return prefix }
	return supported.contains(rounded) ? "\(prefix).\(rounded)" : prefix
}
