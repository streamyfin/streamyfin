import Foundation

/// Client deadlines already include Jellyfin clock correction. The native
/// executor owns the deadline so suspended/busy JS cannot delay coordinated play.
final class SyncPlayCommandScheduler {
	struct Command {
		let id: String
		let groupId: String
		let playlistItemId: String
		let kind: String
		let executeAtMs: Double
		let positionSec: Double
	}

	typealias Delivery = (Double, @escaping () -> Void) -> (() -> Void)
	private let nowMs: () -> Double
	private let deliver: Delivery
	private var groupId: String?
	private var playlistItemId: String?
	private var revision: UInt = 0
	private var cancellation: (() -> Void)?
	private var completion: ((Bool) -> Void)?

	init(
		nowMs: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 },
		deliver: @escaping Delivery = { delayMs, callback in
			let work = DispatchWorkItem(block: callback)
			DispatchQueue.main.asyncAfter(deadline: .now() + delayMs / 1000, execute: work)
			return { work.cancel() }
		}
	) {
		self.nowMs = nowMs
		self.deliver = deliver
	}

	func updateMembership(groupId: String?, playlistItemId: String?) {
		if self.groupId != groupId || self.playlistItemId != playlistItemId { cancel() }
		self.groupId = groupId
		self.playlistItemId = playlistItemId
	}

	func cancel() {
		revision &+= 1
		cancellation?()
		cancellation = nil
		let previous = completion
		completion = nil
		previous?(false)
	}

	func schedule(
		_ command: Command,
		execute: @escaping (Command, Double) -> Void,
		completion: @escaping (Bool) -> Void
	) {
		guard matches(command), command.executeAtMs.isFinite,
			command.positionSec.isFinite, command.positionSec >= 0,
			["Pause", "Unpause", "Seek", "Stop"].contains(command.kind)
		else { completion(false); return }
		cancel()
		let expectedRevision = revision
		self.completion = completion
		cancellation = deliver(max(0, command.executeAtMs - nowMs())) { [weak self] in
			guard let self, self.revision == expectedRevision, self.matches(command) else { return }
			let done = self.completion
			self.completion = nil
			self.cancellation = nil
			let lateSeconds = command.kind == "Unpause"
				? max(0, self.nowMs() - command.executeAtMs) / 1000 : 0
			execute(command, command.positionSec + lateSeconds)
			done?(true)
		}
	}

	private func matches(_ command: Command) -> Bool {
		groupId == command.groupId &&
			(command.kind == "Stop" || playlistItemId == command.playlistItemId)
	}

	deinit { cancel() }
}
