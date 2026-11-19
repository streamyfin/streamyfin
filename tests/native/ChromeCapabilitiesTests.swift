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
				decoderSettings: false, technicalInfo: false, speed: true
			),
			"a remote engine offers nothing that drives this device"
		)
		cases += 1
		precondition(
			!ChromeCapabilities.of(isRemote: true, pictureInPictureSupported: false, canChangeSpeed: false).speed
				&& !ChromeCapabilities.of(isRemote: false, pictureInPictureSupported: true, canChangeSpeed: false).speed,
			"speed follows what the engine allows"
		)

		print("PASS: chrome capabilities (\(cases) cases)")
	}
}
