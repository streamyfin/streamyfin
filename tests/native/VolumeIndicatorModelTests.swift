import Foundation

// The TV's level over the remote screen: shown for a moment after each change of the receiver's volume or mute,
// never for the level read as the screen opens nor without a level. Same cases as Android's VolumeIndicatorModelTest.
@main
enum VolumeIndicatorModelTests {
	static var cases = 0

	static func check(_ ok: Bool, _ what: String) {
		cases += 1
		precondition(ok, what)
	}

	/// A clock the test moves by hand, with the delayed actions the model asked for.
	final class FakeClock {
		var now = 0.0
		private var pending: [(id: Int, due: Double, action: () -> Void)] = []
		private var nextId = 0

		func schedule(_ delay: TimeInterval, _ action: @escaping () -> Void) -> () -> Void {
			nextId += 1
			let id = nextId
			pending.append((id, now + delay, action))
			return { [weak self] in self?.pending.removeAll { $0.id == id } }
		}

		func advance(_ seconds: Double) {
			now += seconds
			let due = pending.filter { $0.due <= now + 1e-9 }
			pending.removeAll { entry in due.contains { $0.id == entry.id } }
			due.forEach { $0.action() }
		}
	}

	final class Harness {
		let clock = FakeClock()
		var shown: VolumeIndicator?
		var shows = 0
		lazy var model = VolumeIndicatorModel(schedule: self.clock.schedule) { [unowned self] indicator in
			self.shown = indicator
			self.shows += 1
		}
	}

	static let delay = PlayerConstants.remoteVolumeIndicatorDuration

	static func aLevelChangeShowsTheIndicatorForAMoment() {
		let h = Harness()
		h.model.update(level: 0.30, muted: false)
		h.model.update(level: 0.35, muted: false)
		check(h.shown == VolumeIndicator(level: 0.35, muted: false), "aLevelChangeShowsTheIndicatorForAMoment: shown")
		h.clock.advance(delay - 0.001)
		check(h.shown == VolumeIndicator(level: 0.35, muted: false), "aLevelChangeShowsTheIndicatorForAMoment: still shown")
		h.clock.advance(0.001)
		check(h.shown == nil, "aLevelChangeShowsTheIndicatorForAMoment: hidden after the delay")
	}

	static func anotherChangeRestartsItsDelay() {
		let h = Harness()
		h.model.update(level: 0.30, muted: false)
		h.model.update(level: 0.35, muted: false)
		h.clock.advance(1)
		h.model.update(level: 0.40, muted: false)
		h.clock.advance(delay - 0.001)
		check(h.shown == VolumeIndicator(level: 0.40, muted: false), "anotherChangeRestartsItsDelay: still shown")
		h.clock.advance(0.001)
		check(h.shown == nil, "anotherChangeRestartsItsDelay: hidden after the new delay")
	}

	static func aMutedTargetShowsMuted() {
		let h = Harness()
		h.model.update(level: 0.30, muted: false)
		h.model.update(level: 0.30, muted: true)
		check(h.shown == VolumeIndicator(level: 0.30, muted: true), "aMutedTargetShowsMuted")
	}

	static func noLevelShowsNothing() {
		let h = Harness()
		h.model.update(level: nil, muted: false)
		h.model.update(level: nil, muted: true)
		check(h.shown == nil && h.shows == 0, "noLevelShowsNothing: never shown")
		// A level lost while shown hides it at once: a fixed-volume receiver has nothing to show.
		h.model.update(level: 0.30, muted: false)
		h.model.update(level: 0.35, muted: false)
		h.model.update(level: nil, muted: false)
		check(h.shown == nil, "noLevelShowsNothing: hidden at once")
		h.clock.advance(delay)
		check(h.shown == nil, "noLevelShowsNothing: stays hidden")
	}

	static func theLevelReadAtOpeningShowsNothing() {
		let h = Harness()
		h.model.update(level: 0.30, muted: false)
		check(h.shows == 0, "theLevelReadAtOpeningShowsNothing: opening")
		// Republished unchanged (the snapshot changed for another reason): still nothing.
		h.model.update(level: 0.30, muted: false)
		check(h.shows == 0, "theLevelReadAtOpeningShowsNothing: unchanged")
		// The first level after none is read like the one at opening.
		h.model.update(level: nil, muted: false)
		h.model.update(level: 0.50, muted: false)
		check(h.shows == 0, "theLevelReadAtOpeningShowsNothing: after none")
	}

	static func closingCancelsThePendingHide() {
		let h = Harness()
		h.model.update(level: 0.30, muted: false)
		h.model.update(level: 0.35, muted: false)
		h.model.close()
		let before = h.shows
		h.clock.advance(delay)
		check(h.shows == before, "closingCancelsThePendingHide")
	}

	static func main() {
		aLevelChangeShowsTheIndicatorForAMoment()
		anotherChangeRestartsItsDelay()
		aMutedTargetShowsMuted()
		noLevelShowsNothing()
		theLevelReadAtOpeningShowsNothing()
		closingCancelsThePendingHide()
		print("PASS: volume indicator (\(cases) cases)")
	}
}
