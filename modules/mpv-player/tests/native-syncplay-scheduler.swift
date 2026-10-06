import Foundation

/// Run with swiftc ios/NativePlayer/SyncPlayCommandScheduler.swift + this file.
/// Tests the production native executor with an injected clock/delivery queue.
@main
struct NativeSyncPlaySchedulerTests {
	static func main() {
		var now = 1_000.0
		var deliveries: [(Double, () -> Void)] = []
		var cancellations = 0
		let scheduler = SyncPlayCommandScheduler(nowMs: { now }, deliver: { delay, callback in
			deliveries.append((delay, callback))
			return { cancellations += 1 }
		})
		var results: [Bool] = []
		var executed: [(String, Double)] = []
		func command(_ id: String, _ kind: String = "Unpause", group: String = "group", item: String = "entry", deadline: Double = 2_000, position: Double = 28.8) -> SyncPlayCommandScheduler.Command {
			.init(id: id, groupId: group, playlistItemId: item, kind: kind, executeAtMs: deadline, positionSec: position)
		}
		func schedule(_ command: SyncPlayCommandScheduler.Command) {
			scheduler.schedule(command, execute: { executed.append(($0.id, $1)) }, completion: { results.append($0) })
		}
		scheduler.updateMembership(groupId: "group", playlistItemId: "entry")
		schedule(command("first"))
		precondition(deliveries[0].0 == 1_000 && executed.isEmpty && results.isEmpty, "native must wait for corrected deadline")
		now = 2_800
		deliveries.removeFirst().1()
		precondition(executed[0].1 == 29.6 && results == [true], "late Unpause advances exact fractional seconds")

		schedule(command("old", deadline: 5_000))
		schedule(command("replacement", "Pause", deadline: 5_000))
		precondition(results == [true, false] && cancellations == 1, "replacement resolves cancelled promise")
		deliveries.removeFirst().1()
		precondition(executed.count == 1, "cancelled delivery cannot touch decoder")
		scheduler.updateMembership(groupId: "group", playlistItemId: "entry")
		now = 5_000
		deliveries.removeFirst().1()
		precondition(executed.last!.0 == "replacement" && executed.last!.1 == 28.8, "metadata refresh preserves Pause deadline and position")

		schedule(command("different-item", "Seek", deadline: 6_000))
		scheduler.updateMembership(groupId: "group", playlistItemId: "other")
		deliveries.removeFirst().1()
		precondition(executed.count == 2 && results.last == false, "queue change cancels seek")
		schedule(command("wrong-item", item: "entry"))
		precondition(results.last == false && deliveries.isEmpty, "reject mismatched playlist entry")
		schedule(command("stop", "Stop", item: "entry", deadline: 5_000))
		deliveries.removeFirst().1()
		precondition(executed.last!.0 == "stop", "Stop is group scoped after queue cleared")

		schedule(command("left", item: "other", deadline: 6_000))
		scheduler.updateMembership(groupId: nil, playlistItemId: nil)
		deliveries.removeFirst().1()
		precondition(executed.count == 3 && results.last == false, "leave invalidates pending transport")
		schedule(command("wrong-group", group: "other"))
		precondition(deliveries.isEmpty && results.last == false, "reject outside membership")
		scheduler.updateMembership(groupId: "group", playlistItemId: "entry")
		schedule(command("bad-time", deadline: .nan))
		schedule(command("bad-position", position: .infinity))
		precondition(deliveries.isEmpty && results.last == false, "reject invalid times")
		print("Native SyncPlay scheduler: 8 checks passed")
	}
}
