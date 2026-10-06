import AVFoundation
import UIKit

/// The one place the player changes the shared `AVAudioSession`, on a serial
/// queue of its own.
///
/// Every `AVAudioSession` call is a synchronous XPC round trip to the audio
/// server, which answers in milliseconds until it does not: on the main
/// thread `setCategory` and `setActive` blocked the app for 2 to 8 seconds
/// (Sentry REACT-NATIVE-G7, E0, DZ, J4). So nothing here runs on main, and
/// the session is applied once per player session instead of on every
/// play(): `AudioSessionState` remembers that it is, and the notifications
/// observed in `init` are what make it forget.
///
/// A singleton because the session is one. Two engines can be alive at once
/// (a host's deinit is deferred), and their requests have to run in the order
/// they were made: a teardown after the activation queued before it, never
/// the other way round.
final class PlayerAudioSession {
	static let shared = PlayerAudioSession()

	private let queue = DispatchQueue(label: "streamyfin.player.audio-session", qos: .userInitiated)
	/// Only touched on `queue`.
	private var state = AudioSessionState()

	private init() {
		// After any of these the session may be inactive, or no longer
		// configured by us, and nothing but the next play() puts it back: an
		// interruption (the system deactivated it, and resuming is left to the
		// user), a stay in the background (a suspended app can lose its
		// session without being told), and the audio server restarting.
		let invalidating = [
			AVAudioSession.interruptionNotification,
			AVAudioSession.mediaServicesWereResetNotification,
			UIApplication.didEnterBackgroundNotification,
		]
		for name in invalidating {
			_ = NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { [weak self] _ in
				self?.invalidate()
			}
		}
	}

	/// Applies the playback category and activates the session, unless that is
	/// already done. `completion` runs on the main thread once the session is
	/// settled, whether or not anything had to change.
	func activate(reapply: Bool = false, completion: (() -> Void)? = nil) {
		queue.async {
			if self.state.needsApply(reapply: reapply) {
				let session = AVAudioSession.sharedInstance()
				do {
					try session.setCategory(.playback, mode: .moviePlayback, policy: .longFormAudio, options: [])
					try session.setActive(true)
					self.state.didApply(succeeded: true)
				} catch {
					self.state.didApply(succeeded: false)
					print("Failed to configure audio session: \(error)")
				}
			}
			if let completion {
				DispatchQueue.main.async(execute: completion)
			}
		}
	}

	/// The next `activate()` applies the session again.
	func invalidate() {
		queue.async {
			self.state.invalidate()
		}
	}

	/// Deactivate the session AND reset the category — `setActive(false)` alone
	/// leaves `.playback`/`.longFormAudio` on the shared singleton, so any later
	/// reactivation (foreground, route change, other modules) re-steals audio.
	func tearDown() {
		queue.async {
			self.state.invalidate()
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
