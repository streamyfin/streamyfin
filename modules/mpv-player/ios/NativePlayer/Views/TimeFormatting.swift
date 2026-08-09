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
