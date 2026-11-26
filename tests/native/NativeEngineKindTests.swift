import Foundation

// Which engine a config names: iOS builds mpv only, and refuses any other name instead of
// starting mpv in its place.
@main
enum NativeEngineKindTests {
	static func main() {
		var cases = 0
		func expect(_ name: String?, _ kind: NativeEngineKind?) {
			cases += 1
			let read = NativeEngineKind(configName: name)
			precondition(read == kind, "\(name ?? "nil") read as \(String(describing: read))")
		}

		// Older configs send no engine, or an empty one: mpv.
		expect(nil, .mpv)
		expect("", .mpv)
		expect("  ", .mpv)
		expect("MPV", .mpv)
		// ExoPlayer does not ship on iOS, and no remote engine runs in the chrome yet.
		expect("exoplayer", nil)
		expect("cast", nil)

		// presentPlayer refuses before it builds a session, in this order: a player already up, a
		// stream it cannot read, then an engine the chrome does not build. Past them, the check hands
		// out the engine to build, so the module reads no name a second time.
		func check(_ presented: Bool, _ streamIsValid: Bool, _ engine: String?, _ expected: Result<NativeEngineKind, PresentRefusal>) {
			cases += 1
			let read = PresentRefusal.check(presented: presented, streamIsValid: streamIsValid, engine: engine)
			precondition(read == expected, "\(presented) \(streamIsValid) \(engine ?? "nil") read as \(read)")
		}
		check(false, true, "cast", .failure(.unsupportedEngine("cast")))
		check(false, true, "exoplayer", .failure(.unsupportedEngine("exoplayer")))
		check(false, true, "mpv", .success(.mpv))
		check(false, true, "MPV", .success(.mpv))
		check(false, true, nil, .success(.mpv))
		check(true, false, "cast", .failure(.alreadyPresented))
		check(false, false, "cast", .failure(.invalidStream))

		print("PASS: native engine kind (\(cases) cases)")
	}
}
