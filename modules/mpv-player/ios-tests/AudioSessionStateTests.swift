// Unit tests for ../ios/AudioSessionState.swift, the rules that decide when
// the player has to reach the audio server.
//
// Kept outside ios/ on purpose: the podspec compiles every Swift file under
// that directory into the app. Run through Jest on a Mac
// (modules/mpv-player/src/AudioSession.test.ts), or by hand:
//
//   swiftc modules/mpv-player/ios/AudioSessionState.swift \
//     modules/mpv-player/ios-tests/AudioSessionStateTests.swift -o /tmp/audio-session-state-tests \
//     && /tmp/audio-session-state-tests

import Foundation

var failures = 0

func expect(_ condition: Bool, _ behaviour: String) {
	if condition {
		print("ok    \(behaviour)")
	} else {
		failures += 1
		print("FAIL  \(behaviour)")
	}
}

@main
enum AudioSessionStateTests {
	static func main() {
		var state = AudioSessionState()
		expect(state.needsApply(reapply: false), "the first play of a player session applies the audio session")

		state.didApply(succeeded: true)
		// REACT-NATIVE-E0 and DZ: a resume used to re-activate an active
		// session, and that redundant call is what hung the main thread.
		expect(!state.needsApply(reapply: false), "a resume does not reach the audio server again")

		state.invalidate()
		expect(state.needsApply(reapply: false), "the play after an interruption activates the session again")

		state.didApply(succeeded: false)
		expect(state.needsApply(reapply: false), "a failed activation is retried by the next play")

		state.didApply(succeeded: true)
		// mpv rewrites the category when its audio output opens, while the
		// session stays active, so this one cannot be skipped.
		expect(state.needsApply(reapply: true), "mpv opening its audio output re-applies an active session")

		state.didApply(succeeded: false)
		expect(state.needsApply(reapply: false), "a failed re-apply is not trusted by the next play")

		// exit, not a trap: a trap drops the buffered lines above when the
		// output is a pipe, and those say which rule failed.
		exit(failures == 0 ? 0 : 1)
	}
}
