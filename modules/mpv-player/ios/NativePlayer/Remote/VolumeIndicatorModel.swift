import Foundation

/// What the volume indicator shows: the TV's level, 0 to 1, and whether it is muted. Hidden is nil.
struct VolumeIndicator: Equatable {
	let level: Double
	let muted: Bool
}

/// The TV's level over the remote screen: shown for a moment after each change of the receiver's volume or mute, its
/// delay restarted by the next one. Never for the level read as the screen opens, which is no change, nor without a
/// level (a fixed-volume receiver, a group). On the iPhone the volume buttons go through the Cast SDK and show
/// nothing, so this is the only trace of them; it also shows a change made elsewhere (another phone, the TV).
/// Android: VolumeIndicatorModel.kt.
final class VolumeIndicatorModel {
	/// Runs an action after a delay and hands back its cancel; the screen gives the main queue, the tests a clock.
	typealias Schedule = (_ delay: TimeInterval, _ action: @escaping () -> Void) -> () -> Void

	private let schedule: Schedule
	private let show: (VolumeIndicator?) -> Void
	private var last: VolumeIndicator?
	private var cancelHide: (() -> Void)?

	init(schedule: @escaping Schedule, show: @escaping (VolumeIndicator?) -> Void) {
		self.schedule = schedule
		self.show = show
	}

	/// The receiver's volume as the hub publishes it; `level` nil when it reports none.
	func update(level: Double?, muted: Bool) {
		guard let level else {
			last = nil
			hide()
			return
		}
		let next = VolumeIndicator(level: level, muted: muted)
		let previous = last
		last = next
		// The first level known (opening, or after none) is a reading, and a republished one is no change.
		guard let previous, previous != next else { return }
		cancelHide?()
		show(next)
		cancelHide = schedule(PlayerConstants.remoteVolumeIndicatorDuration) { [weak self] in
			self?.cancelHide = nil
			self?.show(nil)
		}
	}

	/// The screen closes: no hide fires after it.
	func close() {
		cancelHide?()
		cancelHide = nil
	}

	private func hide() {
		guard let cancel = cancelHide else { return }
		cancel()
		cancelHide = nil
		show(nil)
	}
}
