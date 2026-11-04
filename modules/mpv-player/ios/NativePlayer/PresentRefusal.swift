import Foundation

/// Why presentPlayer refuses a config before it builds a session, checked in this order. The
/// initializer answers nil when the player can be presented.
enum PresentRefusal: Equatable {
	case alreadyPresented
	case invalidStream
	case unsupportedEngine(String)

	init?(presented: Bool, streamIsValid: Bool, engine: String?) {
		if presented {
			self = .alreadyPresented
		} else if !streamIsValid {
			self = .invalidStream
		} else if NativeEngineKind(configName: engine) == nil {
			self = .unsupportedEngine(engine ?? "")
		} else {
			return nil
		}
	}
}
