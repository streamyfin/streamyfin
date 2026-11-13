package expo.modules.mpvplayer.nativeplayer

import android.view.KeyEvent

/**
 * Keys of a keyboard on a phone, a tablet or a Chromebook, as the JS player
 * had them: Space plays or pauses, Left and Right skip by the rewind and
 * forward lengths, Back closes the subtitle scale overlay, then the player.
 * The TV has its own handler: there the arrows move the focus.
 */
class PhoneKeyHandler(
    private val viewModel: PlayerViewModel,
    private val onExitRequested: () -> Unit
) {
    fun intercept(event: KeyEvent): Boolean {
        val keyCode = event.keyCode
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action != KeyEvent.ACTION_UP) return false
            if (viewModel.showSubtitleScaleOverlay) {
                viewModel.showSubtitleScaleOverlay = false
                viewModel.scheduleAutoHide()
            } else {
                onExitRequested()
            }
            return true
        }

        val action: () -> Unit = when (keyCode) {
            KeyEvent.KEYCODE_SPACE -> viewModel::togglePlayPause
            KeyEvent.KEYCODE_DPAD_LEFT -> { { viewModel.seekBy(-viewModel.uiOptions.seekBackwardSec) } }
            KeyEvent.KEYCODE_DPAD_RIGHT -> { { viewModel.seekBy(viewModel.uiOptions.seekForwardSec) } }
            else -> return false
        }
        // Nothing may resume playback under the still-watching prompt but its
        // own answer, and an open panel keeps its keys.
        if (viewModel.showStillWatching || viewModel.showEpisodeList ||
            viewModel.showSubtitleSearch || viewModel.showSyncPlayQueue ||
            viewModel.errorMessage != null
        ) return false
        // One press, one action: a held key's repeats are swallowed.
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) action()
        return true
    }
}
