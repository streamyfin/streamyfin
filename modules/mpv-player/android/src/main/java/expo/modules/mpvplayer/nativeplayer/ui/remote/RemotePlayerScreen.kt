package expo.modules.mpvplayer.nativeplayer.ui.remote

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.input.pointer.util.addPointerInputChange
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.remote.RemoteArrangement
import expo.modules.mpvplayer.nativeplayer.remote.RemoteGestures
import expo.modules.mpvplayer.nativeplayer.remote.RemoteLayout
import expo.modules.mpvplayer.nativeplayer.remote.RemoteMetrics
import expo.modules.mpvplayer.nativeplayer.remote.RemoteScreenModel
import expo.modules.mpvplayer.nativeplayer.remote.RemoteScreenState
import expo.modules.mpvplayer.nativeplayer.remote.RemoteSlot
import expo.modules.mpvplayer.nativeplayer.remote.TargetLabel
import expo.modules.mpvplayer.nativeplayer.ui.DoubleTapSeekPill
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
fun RemotePlayerScreen(viewModel: PlayerViewModel, screen: RemoteScreenState) {
    // What the TV does: read here, the screen follows each snapshot, the next episode and the engine's error.
    val model = screen.model
    val targetName = targetLabel(viewModel, model)
    // A new tint fades in; the gradient reaches its bottom color two thirds down and holds it to the edge.
    val fade = tween<Color>(PlayerConstants.REMOTE_TINT_FADE_MS)
    val top by animateColorAsState(Color(screen.colors.top), fade, label = "remoteTintTop")
    val bottom by animateColorAsState(Color(screen.colors.bottom), fade, label = "remoteTintBottom")
    val accent by animateColorAsState(Color(screen.colors.accent), fade, label = "remoteAccent")
    val columnScroll = rememberScrollState()
    CompositionLocalProvider(LocalPlayerActiveColor provides accent) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(0f to top, PlayerConstants.REMOTE_TINT_GRADIENT_END to bottom))
                .closeOnDragDown(viewModel, columnScroll)
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
                if (arrangement.topBar.isNotEmpty()) RemoteTopBar(viewModel, targetName, model.trackMenusEnabled)

                Row(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    arrangement.beside?.let { slot ->
                        // A width, not a weight: weighed against the column's, the share would be of the row.
                        val besideModifier = RemoteMetrics.besideWidth(layout, width)?.let { Modifier.width(it.dp) }
                            ?: Modifier.padding(end = PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP.dp)
                        Box(besideModifier, contentAlignment = Alignment.Center) {
                            Slot(slot, viewModel, screen, model, layout, artwork)
                        }
                    }
                    // The column fills the height it is given, so its free height lands where `spaces` says;
                    // taller than the screen, the weighted spacers get nothing and the column scrolls.
                    BoxWithConstraints(Modifier.weight(1f).fillMaxHeight()) {
                        val viewport = maxHeight
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .verticalScroll(columnScroll)
                                .heightIn(min = viewport),
                        ) {
                            arrangement.column.forEachIndexed { index, slot ->
                                if (index > 0) Spacer(Modifier.height(SlotGap))
                                if (index in arrangement.spaces) Spacer(Modifier.weight(1f))
                                Slot(slot, viewModel, screen, model, layout, artwork)
                            }
                            if (arrangement.column.size in arrangement.spaces) Spacer(Modifier.weight(1f))
                        }
                    }
                }

                arrangement.bottom.forEach { slot -> Slot(slot, viewModel, screen, model, layout, artwork) }
            }

            if (viewModel.showEpisodeList) {
                EpisodeListSheet(viewModel = viewModel, onDismiss = { viewModel.showEpisodeList = false })
            }
        }
    }
}

/** The TV button's text: the TV's name, or that the session is coming back. */
@Composable
private fun targetLabel(viewModel: PlayerViewModel, model: RemoteScreenModel): String? =
    when (val label = model.targetLabel) {
        is TargetLabel.Name -> label.name
        TargetLabel.Reconnecting -> viewModel.strings.get("reconnecting", "Reconnecting")
    }

/** One slot, alone in its place: the column, the side or the bottom band. The top bar draws its own three. */
@Composable
private fun Slot(slot: RemoteSlot, viewModel: PlayerViewModel, screen: RemoteScreenState, model: RemoteScreenModel, layout: RemoteLayout, artwork: Dp) {
    val targetName = targetLabel(viewModel, model)
    when (slot) {
        RemoteSlot.HEADER -> RemoteHeader(viewModel)
        RemoteSlot.ARTWORK -> Box(contentAlignment = Alignment.Center, modifier = if (layout == RemoteLayout.PORTRAIT) Modifier.fillMaxWidth() else Modifier) {
            Box {
                // The artwork's double tap seeks like the bar, so it rests when the bar does.
                RemoteArtwork(viewModel, artwork, screen.imageHeaders, if (model.seekEnabled) Modifier.seekOnDoubleTap(viewModel) else Modifier)
                // The chrome's pill, on the half that was tapped.
                viewModel.doubleTapSeekForward?.let { forward ->
                    Box(Modifier.matchParentSize(), contentAlignment = if (forward) Alignment.CenterEnd else Alignment.CenterStart) {
                        DoubleTapSeekPill(
                            forward = forward,
                            seconds = if (forward) viewModel.uiOptions.seekForwardSec else viewModel.uiOptions.seekBackwardSec,
                        )
                    }
                }
            }
        }
        RemoteSlot.TITLES -> RemoteTitles(viewModel, compact = false, modifier = Modifier.fillMaxWidth())
        RemoteSlot.BAR -> Column(Modifier.fillMaxWidth()) {
            // A failure is said above the bar, whatever the TV does.
            model.failure?.let { message ->
                Text(text = message, color = Color.White, fontSize = 14.sp, modifier = Modifier.padding(bottom = 8.dp))
            }
            RemoteBar(viewModel, enabled = model.seekEnabled, modifier = Modifier.inert(!model.seekEnabled))
        }
        RemoteSlot.TRANSPORT -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            RemoteTransportRow(
                viewModel,
                layout,
                spinner = model.playShowsSpinner,
                enabled = model.transportEnabled,
                modifier = Modifier.inert(!model.transportEnabled),
            )
        }
        RemoteSlot.BOTTOM_ROW -> RemoteBottomRow(viewModel, targetName, model.trackMenusEnabled)
    }
}

/** A double tap on a half of the artwork seeks back or forward; the offset runs from the physical left edge. */
private fun Modifier.seekOnDoubleTap(viewModel: PlayerViewModel): Modifier =
    pointerInput(viewModel) {
        detectTapGestures(onDoubleTap = { offset ->
            viewModel.seekWithPill(forward = RemoteGestures.artworkTapSeek(offset.x.toDouble() / size.width) > 0)
        })
    }

/**
 * Watches each drag on the screen in the Initial pass without consuming it, so the bar, the buttons and the column's
 * scroll keep theirs, and closes the screen like the chevron when RemoteGestures accepts the drag down. A drag that
 * scrubbed the bar, began with the column scrolled, or never passed the touch slop (a tap) leaves it open.
 */
private fun Modifier.closeOnDragDown(viewModel: PlayerViewModel, columnScroll: ScrollState): Modifier =
    pointerInput(viewModel, columnScroll) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            val startedAtTop = columnScroll.value == 0
            // Each event's batched history goes in too: the latest position alone reads a flick slower than it is.
            val tracker = VelocityTracker().apply { addPointerInputChange(down) }
            var scrubbed = viewModel.isScrubbing
            var passedSlop = false
            var lastY = down.position.y
            while (true) {
                val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.id == down.id } ?: return@awaitEachGesture
                if (viewModel.isScrubbing) scrubbed = true
                tracker.addPointerInputChange(change)
                lastY = change.position.y
                if (lastY - down.position.y > viewConfiguration.touchSlop) passedSlop = true
                if (!change.pressed) break
            }
            if (scrubbed || !startedAtTop || !passedSlop) return@awaitEachGesture
            val close = RemoteGestures.shouldDismissOnDrag(
                distanceDp = ((lastY - down.position.y) / density).toDouble(),
                velocityDpPerSec = (tracker.calculateVelocity().y / density).toDouble(),
                heightDp = (size.height / density).toDouble(),
            )
            if (close) viewModel.close()
        }
    }
