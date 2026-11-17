package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.nativeplayer.PlayerConstants

/** What previous does on a remote screen. */
enum class PreviousAction { RESTART, PREVIOUS_ITEM }

/**
 * The receiver never goes back to the start of what it plays: past the chrome's threshold, or on the first episode,
 * previous restarts the episode on the engine; before it, JS sends the episode before.
 */
fun previousAction(positionSec: Double, hasPrevious: Boolean): PreviousAction =
    if (!hasPrevious || positionSec > PlayerConstants.CHAPTER_RESTART_THRESHOLD_SEC) PreviousAction.RESTART
    else PreviousAction.PREVIOUS_ITEM

/** Whether the episode list holds an episode before and after the one the TV plays. */
data class EpisodeNeighbours(val hasPrevious: Boolean, val hasNext: Boolean) {
    companion object {
        // From the episode list, not the receiver's queue: the queue ends where the bounded list does.
        fun of(episodeIds: List<String>, currentId: String?): EpisodeNeighbours {
            val index = if (currentId == null) -1 else episodeIds.indexOf(currentId)
            if (index < 0) return EpisodeNeighbours(hasPrevious = false, hasNext = false)
            return EpisodeNeighbours(hasPrevious = index > 0, hasNext = index < episodeIds.size - 1)
        }
    }
}
