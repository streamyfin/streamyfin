import Foundation

/// What previous does on a remote screen.
enum PreviousAction: Equatable {
	case restart
	case previousItem
}

/// The receiver never goes back to the start of what it plays: past the chrome's threshold, or on the first episode,
/// previous restarts the episode on the engine; before it, JS sends the episode before.
func previousAction(positionSec: Double, hasPrevious: Bool) -> PreviousAction {
	if !hasPrevious || positionSec > PlayerConstants.chapterRestartThreshold { return .restart }
	return .previousItem
}

/// Whether the episode list holds an episode before and after the one the TV plays.
struct EpisodeNeighbours: Equatable {
	let hasPrevious: Bool
	let hasNext: Bool

	/// From the episode list, not the receiver's queue: the queue ends where the bounded list does.
	static func of(_ episodeIds: [String], currentId: String?) -> EpisodeNeighbours {
		guard let currentId, let index = episodeIds.firstIndex(of: currentId) else {
			return EpisodeNeighbours(hasPrevious: false, hasNext: false)
		}
		return EpisodeNeighbours(hasPrevious: index > 0, hasNext: index < episodeIds.count - 1)
	}
}
