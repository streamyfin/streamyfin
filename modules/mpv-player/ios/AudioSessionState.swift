/// What the player believes about the shared `AVAudioSession`, and from that
/// whether a request has to reach the audio server at all.
///
/// Kept free of AVFoundation so the rules are unit tested
/// (`ios-tests/AudioSessionStateTests.swift`). `PlayerAudioSession` owns the
/// one instance and only touches it on its serial queue.
struct AudioSessionState {
	/// True once our category is applied and the session activated, until
	/// something takes either away.
	private(set) var isApplied = false

	/// play() asks on every call, and only the first one of a player session,
	/// or the first after `invalidate()`, has work to do. `reapply` is for
	/// when something else is known to have rewritten the session while it
	/// stayed active: mpv opening its audio output.
	func needsApply(reapply: Bool) -> Bool {
		reapply || !isApplied
	}

	/// A failed attempt leaves the session unapplied, so the next play()
	/// tries again instead of trusting it.
	mutating func didApply(succeeded: Bool) {
		isApplied = succeeded
	}

	mutating func invalidate() {
		isApplied = false
	}
}
