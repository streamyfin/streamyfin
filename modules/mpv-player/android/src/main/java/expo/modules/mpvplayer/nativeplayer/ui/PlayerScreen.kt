package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel

@Composable
fun PlayerScreen(
    viewModel: PlayerViewModel,
    onPipClick: (() -> Unit)? = null
) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isCompact = maxWidth < 500.dp

        // Layer 1: Gesture plane (full screen touch and gesture handling)
        GesturePlane(viewModel = viewModel)

        // Layer 2: Gradient scrims
        AnimatedVisibility(
            visible = viewModel.controlsVisible,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                // Top scrim
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(130.dp)
                        .align(Alignment.TopCenter)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(PlayerDarkScrim, Color.Transparent)
                            )
                        )
                )

                // Bottom scrim
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(150.dp)
                        .align(Alignment.BottomCenter)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color.Transparent, PlayerDarkScrim)
                            )
                        )
                )
            }
        }

        // Layer 3: Controls (Top Bar, Center Controls, Bottom Bar)
        AnimatedVisibility(
            visible = viewModel.controlsVisible,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                PlayerTopBar(
                    viewModel = viewModel,
                    compact = isCompact,
                    onPipClick = onPipClick,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .windowInsetsPadding(
                            WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)
                        )
                )

                CenterControls(
                    viewModel = viewModel,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .windowInsetsPadding(
                            WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)
                        )
                        .padding(horizontal = if (viewModel.uiOptions.showVolumeSlider || viewModel.uiOptions.showBrightnessSlider) 62.dp else 24.dp)
                )

                PlayerBottomBar(
                    viewModel = viewModel,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .windowInsetsPadding(
                            WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal)
                        )
                )
            }
        }

        // Layer 4: Buffering Spinner (shown when controls are hidden)
        if (viewModel.isBuffering && !viewModel.isScrubbing && viewModel.errorMessage == null && !viewModel.controlsVisible) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(
                        WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)
                    ),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    color = Color.White,
                    modifier = Modifier.size(44.dp),
                    strokeWidth = 3.dp
                )
            }
        }

        // Layer 5: Edge Sliders (Brightness left, Volume right)
        Row(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(
                    WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)
                )
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (viewModel.uiOptions.showBrightnessSlider &&
                (viewModel.controlsVisible || viewModel.brightnessSliderRevealed)
            ) {
                BrightnessSliderView(
                    viewModel = viewModel,
                    controller = viewModel.brightnessController
                )
            }
            Spacer(modifier = Modifier.weight(1f))
            if (viewModel.uiOptions.showVolumeSlider &&
                (viewModel.controlsVisible || viewModel.volumeSliderRevealed)
            ) {
                VolumeSliderView(
                    viewModel = viewModel,
                    controller = viewModel.volumeController
                )
            }
        }

        // Layer 6: Action Pills (Skip Segment, Next Episode Countdown)
        if (!viewModel.controlsLocked) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(
                        WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal)
                    )
                    // Clears the bottom bar, which carries a chapter label and
                    // an ends-at line above the scrubber (iOS parity).
                    .padding(end = 24.dp, bottom = if (viewModel.controlsVisible) 124.dp else 32.dp),
                contentAlignment = Alignment.BottomEnd
            ) {
                val countdown = viewModel.countdownRemaining
                val next = viewModel.nextEpisode
                if (countdown != null && next != null) {
                    NextEpisodeCountdownView(
                        viewModel = viewModel,
                        next = next,
                        remaining = countdown
                    )
                } else {
                    viewModel.activeSegment?.let { segment ->
                        SkipSegmentButton(viewModel = viewModel, segment = segment)
                    }
                }
            }
        }

        // Layer 7: 2x Hold-Speed Pill
        if (viewModel.isHoldSpeedActive) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(
                        WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)
                    )
                    .padding(top = 24.dp),
                contentAlignment = Alignment.TopCenter
            ) {
                HoldSpeedPill(speedRate = viewModel.uiOptions.holdToSpeedRate)
            }
        }

        // Layer 8: Double-Tap Seek Feedback Pill
        viewModel.doubleTapSeekForward?.let { forward ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(
                        WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)
                    )
                    .padding(horizontal = 48.dp),
                contentAlignment = if (forward) Alignment.CenterEnd else Alignment.CenterStart
            ) {
                DoubleTapSeekPill(
                    forward = forward,
                    seconds = if (forward) viewModel.uiOptions.seekForwardSec else viewModel.uiOptions.seekBackwardSec
                )
            }
        }

        // Layer 9: Unlock Controls Pill (in lock mode) — top edge, same slot as
        // the 2× pill above (iOS PlayerControlsRootView parity).
        if (viewModel.controlsLocked && viewModel.unlockButtonRevealed) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(
                        WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)
                    )
                    .padding(top = 24.dp),
                contentAlignment = Alignment.TopCenter
            ) {
                UnlockControlsPill(viewModel = viewModel)
            }
        }

        // Layer 10: Technical Info Overlay
        if (viewModel.showTechnicalInfo) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(16.dp),
                contentAlignment = Alignment.Center
            ) {
                TechnicalInfoOverlay(
                    viewModel = viewModel,
                    onDismiss = { viewModel.showTechnicalInfo = false }
                )
            }
        }

        // Layer 11: Still Watching Overlay
        if (viewModel.showStillWatching) {
            StillWatchingOverlay(viewModel = viewModel)
        }

        // Layer 12: Sheets (Episode List & Subtitle Search)
        if (viewModel.showEpisodeList) {
            EpisodeListSheet(
                viewModel = viewModel,
                onDismiss = {
                    viewModel.showEpisodeList = false
                    viewModel.scheduleAutoHide()
                }
            )
        }

        if (viewModel.showSubtitleSearch) {
            SubtitleSearchSheet(
                viewModel = viewModel,
                onDismiss = {
                    viewModel.showSubtitleSearch = false
                    viewModel.scheduleAutoHide()
                }
            )
        }

        if (viewModel.showSubtitleScaleOverlay) {
            SubtitleScaleOverlay(viewModel)
        }
    }
}
