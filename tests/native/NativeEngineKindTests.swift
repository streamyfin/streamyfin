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

		print("PASS: native engine kind (\(cases) cases)")
	}
}
