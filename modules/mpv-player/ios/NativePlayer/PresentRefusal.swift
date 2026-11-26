import Foundation

/// Why presentPlayer refuses a config before it builds a session, checked in this order.
enum PresentRefusal: Error, Equatable {
	case alreadyPresented
	case invalidStream
	case unsupportedEngine(String)

	/// The engine to build when the player can be presented, the refusal otherwise: the module
	/// reads the engine name here only.
	static func check(presented: Bool, streamIsValid: Bool, engine: String?) -> Result<NativeEngineKind, PresentRefusal> {
		if presented { return .failure(.alreadyPresented) }
		if !streamIsValid { return .failure(.invalidStream) }
		guard let kind = NativeEngineKind(configName: engine) else {
			return .failure(.unsupportedEngine(engine ?? ""))
		}
		return .success(kind)
	}
}
