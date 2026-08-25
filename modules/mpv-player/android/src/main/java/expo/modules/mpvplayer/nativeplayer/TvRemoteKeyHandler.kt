package expo.modules.mpvplayer.nativeplayer

import android.view.KeyEvent
import kotlin.math.min

class TvRemoteKeyHandler(
    private val viewModel: PlayerViewModel,
    private val onExitRequested: () -> Unit
) {
    fun intercept(event: KeyEvent): Boolean {
        val keyCode = event.keyCode
        val action = event.action
        val repeatCount = event.repeatCount
        val zone = deriveTvFocusZone(viewModel)

        // 1. Back Key: Cascade
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                when {
                    viewModel.showExitConfirmation -> {
                        viewModel.dismissExitConfirmation()
                    }
                    viewModel.showSubtitleSearch -> {
                        viewModel.closeSubtitleSearch()
                        viewModel.showControls()
                    }
                    viewModel.tvMenuRoute.isNotEmpty() -> {
                        viewModel.popTvMenu()
                    }
                    viewModel.showEpisodeList -> {
                        viewModel.showEpisodeList = false
                    }
                    viewModel.isScrubbing -> {
                        viewModel.cancelScrub()
                    }
                    viewModel.controlsVisible -> {
                        viewModel.controlsVisible = false
                    }
                    viewModel.countdownRemaining != null -> {
                        viewModel.cancelNextEpisodeCountdown()
                    }
                    viewModel.seekFeedbackVisible -> {
                        viewModel.hideSeekFeedback()
                    }
                    viewModel.errorMessage != null -> {
                        onExitRequested()
                    }
                    else -> {
                        viewModel.requestExitConfirmation()
                    }
                }
            }
            return true
        }

        // 2. Media Transport Keys (Always handled)
        when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                    if (viewModel.isScrubbing) {
                        viewModel.commitScrubAndPlay()
                    } else {
                        viewModel.togglePlayPause()
                    }
                }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_PLAY -> {
                if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                    if (viewModel.isScrubbing) {
                        viewModel.commitScrubAndPlay()
                    } else {
                        viewModel.play()
                    }
                }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                    viewModel.pause()
                }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                    viewModel.seekBy(viewModel.uiOptions.seekForwardSec)
                    if (!viewModel.controlsVisible) viewModel.flashSeekFeedback()
                }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_REWIND -> {
                if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                    viewModel.seekBy(-viewModel.uiOptions.seekBackwardSec)
                    if (!viewModel.controlsVisible) viewModel.flashSeekFeedback()
                }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_NEXT -> {
                if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                    viewModel.playNextEpisode()
                }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_PREVIOUS -> {
                if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                    viewModel.seekTo(0.0)
                }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_STOP -> {
                if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                    viewModel.requestExitConfirmation()
                }
                return true
            }
        }

        // While the controls are up, directional keys fall through to the Compose
        // focus engine below — re-arm the auto-hide timer here or the controls
        // vanish mid-navigation once the original delay elapses.
        if (viewModel.controlsVisible && action == KeyEvent.ACTION_DOWN) {
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT,
                KeyEvent.KEYCODE_DPAD_RIGHT,
                KeyEvent.KEYCODE_DPAD_UP,
                KeyEvent.KEYCODE_DPAD_DOWN,
                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_NUMPAD_ENTER -> viewModel.scheduleAutoHide()
            }
        }

        // 3. DPAD / Directional Keys (Handled only when zone == NONE or scrubbing)
        if (zone == TvFocusZone.NONE || viewModel.isScrubbing) {
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                    if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                        when {
                            viewModel.countdownRemaining != null -> {
                                viewModel.playNextEpisode()
                            }
                            viewModel.isScrubbing -> {
                                viewModel.commitScrub()
                            }
                            viewModel.activeSegment != null -> {
                                viewModel.skipActiveSegment()
                            }
                            else -> {
                                viewModel.showControls()
                            }
                        }
                    }
                    return true
                }
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    if (action == KeyEvent.ACTION_DOWN) {
                        if (viewModel.isScrubbing) {
                            val mult = min(
                                1.0 + repeatCount.toDouble() / PlayerConstants.TV_SCRUB_ACCEL_REPEATS_PER_STEP,
                                PlayerConstants.TV_SCRUB_ACCEL_MAX_MULTIPLIER
                            )
                            viewModel.nudgeScrub(-viewModel.uiOptions.seekBackwardSec * mult)
                        } else {
                            viewModel.seekBy(-viewModel.uiOptions.seekBackwardSec)
                            viewModel.flashSeekFeedback()
                        }
                    }
                    return true
                }
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    if (action == KeyEvent.ACTION_DOWN) {
                        if (viewModel.isScrubbing) {
                            val mult = min(
                                1.0 + repeatCount.toDouble() / PlayerConstants.TV_SCRUB_ACCEL_REPEATS_PER_STEP,
                                PlayerConstants.TV_SCRUB_ACCEL_MAX_MULTIPLIER
                            )
                            viewModel.nudgeScrub(viewModel.uiOptions.seekForwardSec * mult)
                        } else {
                            viewModel.seekBy(viewModel.uiOptions.seekForwardSec)
                            viewModel.flashSeekFeedback()
                        }
                    }
                    return true
                }
                KeyEvent.KEYCODE_DPAD_UP,
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (action == KeyEvent.ACTION_UP && repeatCount == 0) {
                        if (viewModel.errorMessage == null && !viewModel.isScrubbing) {
                            viewModel.showControls()
                        }
                    }
                    return true
                }
            }
        }

        return false
    }
}
