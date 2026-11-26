import Foundation

/// The engines the native chrome builds on iOS, under the name a config gives them (`config.engine`).
enum NativeEngineKind: String {
	case mpv

	/// The engine `configName` stands for, nil for one the chrome does not build. No name means mpv:
	/// older configs send none.
	init?(configName: String?) {
		guard let name = configName, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
			self = .mpv
			return
		}
		self.init(rawValue: name.lowercased())
	}
}
