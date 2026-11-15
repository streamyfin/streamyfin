package expo.modules.mpvplayer.nativeplayer.ui.remote

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.remote.RemoteArrangement
import expo.modules.mpvplayer.nativeplayer.remote.RemoteLayout
import expo.modules.mpvplayer.nativeplayer.remote.RemoteMetrics
import expo.modules.mpvplayer.nativeplayer.remote.RemoteSlot
import expo.modules.mpvplayer.nativeplayer.ui.EpisodeListSheet
import expo.modules.mpvplayer.nativeplayer.ui.LocalPlayerActiveColor

private val SlotGap = 16.dp

/**
 * The remote player's screen. Its layout follows the window's size class (RemoteLayout): upright, the six slots
 * stand top to bottom; couched, the titles and menus share a bar across the top, the artwork sits left of the
 * transport and the bar runs along the bottom; wide, the upright column stands beside the artwork. Where each slot
 * goes is RemoteArrangement's; the artwork's size is RemoteMetrics', so it shrinks before anything is cut.
 */
@Composable
fun RemotePlayerScreen(viewModel: PlayerViewModel, targetName: String?) {
    CompositionLocalProvider(LocalPlayerActiveColor provides RemoteActiveColor) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .windowInsetsPadding(WindowInsets.safeDrawing),
        ) {
            val width = maxWidth.value.toDouble()
            val height = maxHeight.value.toDouble()
            val layout = RemoteLayout.of(width, height)
            val artwork = RemoteMetrics.artworkHeight(layout, width, height, LocalDensity.current.fontScale.toDouble()).dp
            val arrangement = RemoteArrangement.of(layout)

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP.dp),
            ) {
                if (arrangement.topBar.isNotEmpty()) RemoteTopBar(viewModel, targetName)

                Row(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    arrangement.beside?.let { slot ->
                        val besideModifier = if (layout == RemoteLayout.WIDE) {
                            Modifier.weight(PlayerConstants.REMOTE_WIDE_ARTWORK_FRACTION.toFloat())
                        } else {
                            Modifier.padding(end = PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP.dp)
                        }
                        Box(besideModifier, contentAlignment = Alignment.Center) {
                            Slot(slot, viewModel, targetName, layout, artwork)
                        }
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(SlotGap, Alignment.CenterVertically),
                    ) {
                        arrangement.column.forEach { slot -> Slot(slot, viewModel, targetName, layout, artwork) }
                    }
                }

                arrangement.bottom.forEach { slot -> Slot(slot, viewModel, targetName, layout, artwork) }
            }

            if (viewModel.showEpisodeList) {
                EpisodeListSheet(viewModel = viewModel, onDismiss = { viewModel.showEpisodeList = false })
            }
        }
    }
}

/** One slot, alone in its place: the column, the side or the bottom band. The top bar draws its own three. */
@Composable
private fun Slot(slot: RemoteSlot, viewModel: PlayerViewModel, targetName: String?, layout: RemoteLayout, artwork: Dp) {
    when (slot) {
        RemoteSlot.HEADER -> RemoteHeader(viewModel)
        RemoteSlot.ARTWORK -> Box(contentAlignment = Alignment.Center, modifier = if (layout == RemoteLayout.PORTRAIT) Modifier.fillMaxWidth() else Modifier) {
            RemoteArtwork(viewModel, artwork)
        }
        RemoteSlot.TITLES -> RemoteTitles(viewModel, compact = false, modifier = Modifier.fillMaxWidth())
        RemoteSlot.BAR -> RemoteBar(viewModel)
        RemoteSlot.TRANSPORT -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            RemoteTransportRow(viewModel, layout)
        }
        RemoteSlot.BOTTOM_ROW -> RemoteBottomRow(viewModel, targetName)
    }
}
