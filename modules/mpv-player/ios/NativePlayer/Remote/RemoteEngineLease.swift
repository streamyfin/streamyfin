import Foundation

/// A remote engine lent to a screen. The engine lives with the connection to the TV, not with the screen:
/// the screen hands it back by `release` and never calls stop() or shutdown() itself, so closing it sends
/// nothing to the TV.
final class RemoteEngineLease {
	let engine: ChromeEngine
	let release: () -> Void

	init(engine: ChromeEngine, release: @escaping () -> Void) {
		self.engine = engine
		self.release = release
	}
}
