import Foundation

// What a remote screen emits carries `remote = true`, so JS's local player never reports a playback that
// is not its own; presentRemotePlayer refuses a player already up, a TV, then no remote engine to drive.
@main
enum RemoteEventsTests {
	static var cases = 0

	static func check(_ ok: Bool, _ what: String) {
		cases += 1
		precondition(ok, what)
	}

	static func everyRemoteEventSaysItIsRemote() {
		let bodies: [[String: Any]] = [
			[:],
			["reason": "closeButton"],
			// Whatever a body claims, the mark wins.
			["remote": false, "positionSec": 3.0],
		]
		for body in bodies {
			let marked = markRemote(body)
			check(marked["remote"] as? Bool == true, "everyRemoteEventSaysItIsRemote: \(marked)")
			check(
				Set(marked.keys.filter { $0 != "remote" }) == Set(body.keys.filter { $0 != "remote" }),
				"everyRemoteEventSaysItIsRemote: keeps the body \(marked)"
			)
		}
		check(
			markRemote(["positionSec": 3.0])["positionSec"] as? Double == 3.0,
			"everyRemoteEventSaysItIsRemote: keeps the values"
		)
	}

	static func presentingWithNoRemoteEngineIsRefused() {
		check(
			PresentRefusal(presented: false, hasRemoteEngine: false, isTv: false) == .noRemoteEngine,
			"presentingWithNoRemoteEngineIsRefused: no engine"
		)
		check(
			PresentRefusal(presented: true, hasRemoteEngine: false, isTv: true) == .alreadyPresented,
			"presentingWithNoRemoteEngineIsRefused: a player already up comes first"
		)
		check(
			PresentRefusal(presented: false, hasRemoteEngine: true, isTv: true) == .remoteUnsupported,
			"presentingWithNoRemoteEngineIsRefused: a TV never presents one"
		)
		check(
			PresentRefusal(presented: false, hasRemoteEngine: true, isTv: false) == nil,
			"presentingWithNoRemoteEngineIsRefused: presented"
		)
	}

	static func main() {
		everyRemoteEventSaysItIsRemote()
		presentingWithNoRemoteEngineIsRefused()
		print("PASS: remote events and the remote present refusal (\(cases) cases)")
	}
}
