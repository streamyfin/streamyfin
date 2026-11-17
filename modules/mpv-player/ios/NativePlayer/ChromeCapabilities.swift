import Foundation

/// What the phone chrome may offer for the engine it holds. Pure: the view model reads the engine,
/// this decides. A remote engine has no screen here, so nothing that drives this device's picture,
/// brightness or decoder; speed follows what the engine allows. A remote chrome is a remote control:
/// its controls stay up, a drag leaves the target playing, and nothing it offers needs the phone awake
/// or turned (the TV goes on by itself).
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
	/// The Cast button, which hands this device's video off to a receiver: JS allows it, for a local engine.
	var cast = false
	/// The controls hide on their own after a while.
	var autoHide = true
	/// A drag on the bar pauses playback until it is released.
	var pausesWhileScrubbing = true
	var sleepTimer = true
	var lockControls = true
	var rotate = true
	/// The phone decides what follows the end: the next episode card counts down and starts the next one,
	/// or the still watching card asks first. A remote target's list moves on by itself, and the remote screen
	/// decides what its end leads to.
	var nextEpisodeCountdown = true

	static func of(
		isRemote: Bool, pictureInPictureSupported: Bool, canChangeSpeed: Bool, allowCast: Bool = false
	) -> ChromeCapabilities {
		ChromeCapabilities(
			pictureInPicture: !isRemote && pictureInPictureSupported,
			zoom: !isRemote,
			brightness: !isRemote,
			decoderSettings: !isRemote,
			technicalInfo: !isRemote,
			speed: canChangeSpeed,
			cast: !isRemote && allowCast,
			autoHide: !isRemote,
			pausesWhileScrubbing: !isRemote,
			sleepTimer: !isRemote,
			lockControls: !isRemote,
			rotate: !isRemote,
			nextEpisodeCountdown: !isRemote
		)
	}
}
