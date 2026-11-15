import Foundation

/// Why presentPlayer refuses a config before it builds a session, checked in this order. The
/// initializer answers nil when the player can be presented.
enum PresentRefusal: Equatable {
	case alreadyPresented
	case invalidStream
	case unsupportedEngine(String)
	/// presentRemotePlayer with no remote engine to drive.
	case noRemoteEngine
	/// presentRemotePlayer on a device that does not cast: tvOS and Catalyst.
	case remoteUnsupported

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

	/// Why presentRemotePlayer refuses, checked in this order: a player already up (local or remote), a
	/// device that does not cast, then no remote engine to drive; nil when it presents.
	init?(presented: Bool, hasRemoteEngine: Bool, isTv: Bool) {
		if presented {
			self = .alreadyPresented
		} else if isTv {
			self = .remoteUnsupported
		} else if !hasRemoteEngine {
			self = .noRemoteEngine
		} else {
			return nil
		}
	}
}
