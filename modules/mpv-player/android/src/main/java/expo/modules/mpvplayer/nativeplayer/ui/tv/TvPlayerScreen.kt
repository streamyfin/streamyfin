package expo.modules.mpvplayer.nativeplayer.ui.tv

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.TvFocusZone
import expo.modules.mpvplayer.nativeplayer.deriveTvFocusZone

@Composable
fun TvPlayerScreen(
    viewModel: PlayerViewModel,
    onZoneChanged: (TvFocusZone) -> Unit,
    modifier: Modifier = Modifier
) {
    val currentZone by remember(viewModel) {
        derivedStateOf { deriveTvFocusZone(viewModel) }
    }

    LaunchedEffect(currentZone) {
        onZoneChanged(currentZone)
    }

    var lastFocusedControl by remember { mutableStateOf<TvControl?>(TvControl.PLAY_PAUSE) }

    val showChrome = viewModel.controlsVisible || viewModel.isScrubbing || viewModel.seekFeedbackVisible
    val isModalOpen = viewModel.tvMenuRoute.isNotEmpty() ||
            viewModel.showEpisodeList ||
            viewModel.showSubtitleSearch ||
            viewModel.showStillWatching ||
            viewModel.showExitConfirmation

    Box(modifier = modifier.fillMaxSize()) {
        // --- 1. Scrims & Chrome Layer ---
        AnimatedVisibility(
            visible = showChrome && !isModalOpen,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                // Top & Bottom gradient scrims
                Column(modifier = Modifier.fillMaxSize()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(240.dp)
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(
                                        Color.Black.copy(alpha = 0.55f),
                                        Color.Black.copy(alpha = 0f)
                                    )
                                )
                            )
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(280.dp)
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(
                                        Color.Black.copy(alpha = 0f),
                                        Color.Black.copy(alpha = 0.55f)
                                    )
                                )
                            )
                    )
                }

                // Chrome content
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(
                            horizontal = TvMetrics.INSET_H,
                            vertical = TvMetrics.INSET_V
                        ),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    // Top: Metadata Header
                    TvMetadataHeader(viewModel = viewModel)

                    // Bottom: Controls Row + Transport Bar
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        if (viewModel.controlsVisible && !viewModel.isScrubbing) {
                            TvControlsRow(
                                viewModel = viewModel,
                                lastFocused = lastFocusedControl,
                                onControlFocused = { lastFocusedControl = it }
                            )
                        }

                        TvTransportBar(viewModel = viewModel)
                    }
                }
            }
        }

        // --- 2. Status Overlays Layer ---
        TvStatusOverlays(viewModel = viewModel)

        // --- 3. Menu Panel Drawer Layer ---
        if (viewModel.tvMenuRoute.isNotEmpty()) {
            TvMenuPanel(viewModel = viewModel)
        }

        // --- 4. Episode Shelf Layer ---
        if (viewModel.showEpisodeList) {
            TvEpisodeShelf(
                viewModel = viewModel,
                modifier = Modifier.align(Alignment.BottomCenter)
            )
        }

        // --- 5. Subtitle Search Panel Layer ---
        if (viewModel.showSubtitleSearch) {
            TvSubtitleSearchPanel(viewModel = viewModel)
        }

        // --- 6. Still Watching Overlay Layer ---
        if (viewModel.showStillWatching) {
            TvStillWatchingOverlay(viewModel = viewModel)
        }

        // --- 7. Exit Confirmation Overlay Layer ---
        if (viewModel.showExitConfirmation) {
            TvExitConfirmation(viewModel = viewModel)
        }

        // --- 8. Error Overlay Layer ---
        if (viewModel.errorMessage != null) {
            TvErrorOverlay(viewModel = viewModel)
        }
    }
}

@Composable
private fun TvMetadataHeader(
    viewModel: PlayerViewModel,
    modifier: Modifier = Modifier
) {
    val meta = viewModel.metadata ?: return

    Column(
        modifier = modifier.fillMaxWidth(0.7f),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        if (!meta.title.isNullOrBlank()) {
            Text(
                text = meta.title ?: "",
                color = Color.White,
                fontSize = 26.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        if (!meta.subtitle.isNullOrBlank()) {
            Text(
                text = meta.subtitle ?: "",
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 18.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
