import Foundation

/// The body of an event a remote screen emits, marked: JS's local player listeners skip it, and only the
/// remote player's hear it, so the local player never reports a playback that is not its own.
func markRemote(_ body: [String: Any]) -> [String: Any] {
	var marked = body
	marked["remote"] = true
	return marked
}
