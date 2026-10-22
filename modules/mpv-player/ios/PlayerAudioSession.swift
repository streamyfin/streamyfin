import AVFoundation

/// The one place the player changes the shared `AVAudioSession`, on a serial
/// queue of its own.
///
/// Every `AVAudioSession` call is a synchronous XPC round trip to the audio
/// server, which answers in milliseconds until it does not: on the main
/// thread `setCategory` and `setActive` blocked the app for 2 to 8 seconds
/// (Sentry REACT-NATIVE-G7, E0, DZ, J4, HC). So nothing here runs on main.
///
/// Only the thread moved. The session is still applied on every play(), as it
/// was when the call was inline: other audio code in the process shares the
/// session and can deactivate it with no notification (expo-audio does, 100 ms
/// after its last player pauses), and pausing and resuming is what brings the
/// audio back. Remembering that it "is" active would take that away.
///
/// A singleton because the session is one. Two engines can be alive at once
/// (a host's deinit is deferred), and their requests have to run in the order
/// they were made: a teardown after the activation queued before it, never
/// the other way round.
final class PlayerAudioSession {
	static let shared = PlayerAudioSession()

	private let queue = DispatchQueue(label: "streamyfin.player.audio-session", qos: .userInitiated)

	private init() {}

	/// Applies the playback category and activates the session. `completion`
	/// runs on the main thread afterwards, whether or not the session took it.
	func activate(completion: (() -> Void)? = nil) {
		queue.async {
			let session = AVAudioSession.sharedInstance()
			do {
				try session.setCategory(.playback, mode: .moviePlayback, policy: .longFormAudio, options: [])
				try session.setActive(true)
			} catch {
				print("Failed to configure audio session: \(error)")
			}
			if let completion {
				DispatchQueue.main.async(execute: completion)
			}
		}
	}

	/// Deactivate the session AND reset the category — `setActive(false)` alone
	/// leaves `.playback`/`.longFormAudio` on the shared singleton, so any later
	/// reactivation (foreground, route change, other modules) re-steals audio.
	func tearDown() {
		queue.async {
			let session = AVAudioSession.sharedInstance()
			try? session.setActive(false, options: .notifyOthersOnDeactivation)
			try? session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
		}
	}

	/// Returns once every change requested so far has been made. For the mpv
	/// work queue, ahead of the commands that open or restart the audio
	/// output. Never for the main thread, which is exactly what this type
	/// keeps out of the audio server.
	func waitForPendingChanges() {
		queue.sync {}
	}
}
