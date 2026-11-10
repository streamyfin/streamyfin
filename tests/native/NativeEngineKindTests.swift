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
		// stream it cannot read, then an engine the chrome does not build.
		func refuse(_ presented: Bool, _ streamIsValid: Bool, _ engine: String?, _ refusal: PresentRefusal?) {
			cases += 1
			let read = PresentRefusal(presented: presented, streamIsValid: streamIsValid, engine: engine)
			precondition(read == refusal, "\(presented) \(streamIsValid) \(engine ?? "nil") refused as \(String(describing: read))")
		}
		refuse(false, true, "cast", .unsupportedEngine("cast"))
		refuse(false, true, "exoplayer", .unsupportedEngine("exoplayer"))
		refuse(false, true, "mpv", nil)
		refuse(false, true, nil, nil)
		refuse(true, false, "cast", .alreadyPresented)
		refuse(false, false, "cast", .invalidStream)

		print("PASS: native engine kind (\(cases) cases)")
	}
}
