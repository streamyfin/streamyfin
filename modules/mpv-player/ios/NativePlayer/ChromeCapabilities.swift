import Foundation

/// What the phone chrome may offer for the engine it holds. Pure: the view model reads the engine,
/// this decides. A remote engine has no screen here, so nothing that drives this device's picture,
/// brightness or decoder; speed follows what the engine allows.
struct ChromeCapabilities: Equatable {
	let pictureInPicture: Bool
	/// The zoom button, its compact menu entry and the pinch.
	let zoom: Bool
	/// The brightness slider and the left half's vertical drag.
	let brightness: Bool
	/// The audio sync, gain, dialogue and mono rows, the subtitle size and the subtitle sync.
	let decoderSettings: Bool
	let technicalInfo: Bool
	/// The speed menu, the hold to speed up and the initial speed.
	let speed: Bool

	static func of(isRemote: Bool, pictureInPictureSupported: Bool, canChangeSpeed: Bool) -> ChromeCapabilities {
		ChromeCapabilities(
			pictureInPicture: !isRemote && pictureInPictureSupported,
			zoom: !isRemote,
			brightness: !isRemote,
			decoderSettings: !isRemote,
			technicalInfo: !isRemote,
			speed: canChangeSpeed
		)
	}
}
