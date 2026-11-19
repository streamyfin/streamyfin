import Foundation

// What the phone chrome offers for the engine it holds: a remote engine has no screen here, so
// nothing that drives this device's picture or decoder, and speed follows what the engine allows.
@main
enum ChromeCapabilitiesTests {
	static func main() {
		var cases = 0
		func expect(_ read: ChromeCapabilities, _ wanted: ChromeCapabilities, _ what: String) {
			cases += 1
			precondition(read == wanted, "\(what): \(read)")
		}
		let everything = ChromeCapabilities(
			pictureInPicture: true, zoom: true, brightness: true,
			decoderSettings: true, technicalInfo: true, speed: true
		)

		expect(
			ChromeCapabilities.of(isRemote: false, pictureInPictureSupported: true, canChangeSpeed: true),
			everything, "a local engine keeps every control"
		)
		expect(
			ChromeCapabilities.of(isRemote: false, pictureInPictureSupported: false, canChangeSpeed: true),
			ChromeCapabilities(
				pictureInPicture: false, zoom: true, brightness: true,
				decoderSettings: true, technicalInfo: true, speed: true
			),
			"a device without picture in picture loses only that button"
		)
		expect(
			ChromeCapabilities.of(isRemote: true, pictureInPictureSupported: true, canChangeSpeed: true),
			ChromeCapabilities(
				pictureInPicture: false, zoom: false, brightness: false,
				decoderSettings: false, technicalInfo: false, speed: true,
				autoHide: false, pausesWhileScrubbing: false, sleepTimer: false,
				lockControls: false, rotate: false, nextEpisodeCountdown: false
			),
			"a remote engine offers nothing that drives this device"
		)

		let remote = ChromeCapabilities.of(isRemote: true, pictureInPictureSupported: true, canChangeSpeed: true)
		// A remote screen is a remote control: nothing on it is in the way of a picture, so it never hides.
		cases += 1
		precondition(!remote.autoHide, "a remote chrome keeps its controls visible")
		// Pausing the TV for the length of a drag would stall its stream for nothing: the seek goes on release.
		cases += 1
		precondition(!remote.pausesWhileScrubbing, "a remote scrub does not pause the target")
		// A sleeping phone cannot stop the TV, nothing on the phone turns, and the TV goes on by itself.
		cases += 1
		precondition(
			!remote.sleepTimer && !remote.lockControls && !remote.rotate && !remote.nextEpisodeCountdown,
			"a remote chrome has no sleep timer, lock, rotate nor countdown"
		)
		let local = ChromeCapabilities.of(isRemote: false, pictureInPictureSupported: true, canChangeSpeed: true)
		cases += 1
		precondition(
			local.autoHide && local.pausesWhileScrubbing && local.sleepTimer
				&& local.lockControls && local.rotate && local.nextEpisodeCountdown,
			"a local chrome keeps them all"
		)
		cases += 1
		precondition(
			!ChromeCapabilities.of(isRemote: true, pictureInPictureSupported: false, canChangeSpeed: false).speed
				&& !ChromeCapabilities.of(isRemote: false, pictureInPictureSupported: true, canChangeSpeed: false).speed,
			"speed follows what the engine allows"
		)

		// The Cast button hands this device's video off: a local engine shows it when JS allows Cast, a remote one never.
		cases += 1
		precondition(
			ChromeCapabilities.of(
				isRemote: false, pictureInPictureSupported: true, canChangeSpeed: true, allowCast: true
			).cast
				&& !ChromeCapabilities.of(
					isRemote: true, pictureInPictureSupported: true, canChangeSpeed: true, allowCast: true
				).cast
				&& !ChromeCapabilities.of(
					isRemote: false, pictureInPictureSupported: true, canChangeSpeed: true, allowCast: false
				).cast,
			"the Cast button follows the config on local engines"
		)

		print("PASS: chrome capabilities (\(cases) cases)")
	}
}
