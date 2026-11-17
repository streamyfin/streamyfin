package expo.modules.mpvplayer.nativeplayer.ui.remote

import android.graphics.Rect
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.FormatListBulleted
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.remote.RemoteActive
import expo.modules.mpvplayer.nativeplayer.remote.RemoteLayout
import expo.modules.mpvplayer.nativeplayer.remote.RemoteMore
import expo.modules.mpvplayer.nativeplayer.remote.RemoteSpeech
import expo.modules.mpvplayer.nativeplayer.remote.RemoteTransport
import expo.modules.mpvplayer.nativeplayer.ui.AudioMenu
import expo.modules.mpvplayer.nativeplayer.ui.CenterControls
import expo.modules.mpvplayer.nativeplayer.ui.MoreMenu
import expo.modules.mpvplayer.nativeplayer.ui.PlayerBottomBar
import expo.modules.mpvplayer.nativeplayer.ui.LocalPlayerActiveColor
import expo.modules.mpvplayer.nativeplayer.ui.RemoteImage
import expo.modules.mpvplayer.nativeplayer.ui.remoteImageHeaders
import expo.modules.mpvplayer.nativeplayer.ui.SkipSegmentButton
import expo.modules.mpvplayer.nativeplayer.ui.SubtitleMenu
import expo.modules.mpvplayer.nativeplayer.ui.TransportStyle
import kotlin.math.roundToInt

// The remote screen's six slots (design §3.1), which RemotePlayerScreen places by RemoteArrangement. Twin:
// RemoteSlots.swift.

/** What is on or connected: icon and text, with a dot under the icon (design §3.3). The screen provides the
 *  tint's accent as LocalPlayerActiveColor; this is its fallback. */
val RemoteActiveColor = Color(PlayerConstants.REMOTE_ACTIVE_COLOR)

@Composable
private fun activeColor(): Color = LocalPlayerActiveColor.current ?: RemoteActiveColor

private val RemoteButton = PlayerConstants.REMOTE_BUTTON_SMALL_DP.dp

/** Header: the chevron that closes the screen without stopping the TV, and the "more" menu. */
@Composable
internal fun RemoteHeader(viewModel: PlayerViewModel, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        RemoteChevron(viewModel)
        Spacer(Modifier.weight(1f))
        RemoteMoreButton(viewModel)
    }
}

/** The artwork, whole, in a square of the size RemoteMetrics gives, asked for with the user's proxy headers. */
@Composable
internal fun RemoteArtwork(viewModel: PlayerViewModel, size: Dp, imageHeaders: Map<String, String>?, modifier: Modifier = Modifier) {
    RemoteImage(
        url = viewModel.metadata?.artworkUri,
        headers = remoteImageHeaders(viewModel.metadata?.artworkHeaders, imageHeaders),
        contentScale = ContentScale.Fit,
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(8.dp)),
    )
}

/** Title and subtitle, left-aligned; [compact] keeps each to one smaller line, for the couched top bar. */
@Composable
internal fun RemoteTitles(viewModel: PlayerViewModel, compact: Boolean, modifier: Modifier = Modifier) {
    val metadata = viewModel.metadata
    Column(modifier) {
        Text(
            text = metadata?.title.orEmpty(),
            color = Color.White,
            fontSize = if (compact) 15.sp else 22.sp,
            fontWeight = FontWeight.Bold,
            maxLines = if (compact) 1 else 2,
            overflow = TextOverflow.Ellipsis,
        )
        metadata?.subtitle?.let { subtitle ->
            Text(
                text = subtitle,
                color = Color.White.copy(alpha = 0.7f),
                fontSize = if (compact) 12.sp else 15.sp,
                maxLines = if (compact) 1 else 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * The bar, the local chrome's: chapter name, the bar with its marks, elapsed on the left, "Ends at" and the duration
 * on the right, the thumbnail bubble while dragging. The local "Skip intro" sits above it, on the right.
 */
@Composable
internal fun RemoteBar(viewModel: PlayerViewModel, enabled: Boolean, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        viewModel.activeSegment?.takeIf { it.skipMode != "auto" }?.let { segment ->
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                SkipSegmentButton(viewModel = viewModel, segment = segment)
            }
        }
        PlayerBottomBar(viewModel = viewModel, enabled = enabled)
    }
}

/**
 * A control the TV's state leaves inactive: dimmed, and deaf to taps and drags (taken in the Initial pass, before
 * the control sees them). The screen's drag down still sees them: it does not consume. TalkBack reads each button
 * and the bar as its own node, so each says it disabled itself (`enabled`): a disabled wrapper does not reach them.
 */
internal fun Modifier.inert(inert: Boolean): Modifier =
    if (!inert) this else this
        .alpha(PlayerConstants.REMOTE_INERT_ALPHA)
        .pointerInput(Unit) {
            awaitPointerEventScope {
                while (true) awaitPointerEvent(PointerEventPass.Initial).changes.forEach { it.consume() }
            }
        }

/** Previous, back, play, forward, next: the chrome's transport at the remote sizes, play a white disc. */
@Composable
internal fun RemoteTransportRow(viewModel: PlayerViewModel, layout: RemoteLayout, spinner: Boolean, enabled: Boolean, modifier: Modifier = Modifier) {
    val t = RemoteTransport.of(layout)
    CenterControls(
        viewModel = viewModel,
        modifier = modifier,
        style = TransportStyle(side = t.sideDp.dp, seek = t.seekDp.dp, play = t.playDp.dp, gap = t.gapDp.dp, disc = true, fit = true),
        showsSpinner = spinner,
        enabled = enabled,
    )
}

/** The bottom row: the TV on the left, episodes, audio and subtitles on the right. */
@Composable
internal fun RemoteBottomRow(viewModel: PlayerViewModel, targetName: String?, tracksEnabled: Boolean, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        // Weighted without filling, the TV is measured after the track buttons: a long name ends in an ellipsis
        // instead of taking the row and leaving them no width. The buttons keep together in a row of their own.
        RemoteTargetButton(viewModel, targetName, Modifier.weight(1f, fill = false))
        Row(verticalAlignment = Alignment.CenterVertically) { RemoteTrackButtons(viewModel, tracksEnabled) }
    }
}

/** Couched: the chevron, the titles, the TV, the track buttons and "more", in one bar across the top. */
@Composable
internal fun RemoteTopBar(viewModel: PlayerViewModel, targetName: String?, tracksEnabled: Boolean, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        RemoteChevron(viewModel)
        RemoteTitles(
            viewModel,
            compact = true,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 8.dp),
        )
        RemoteTargetButton(viewModel, targetName)
        RemoteTrackButtons(viewModel, tracksEnabled)
        RemoteMoreButton(viewModel)
    }
}

@Composable
private fun RemoteChevron(viewModel: PlayerViewModel) {
    IconButton(onClick = { viewModel.close() }, modifier = Modifier.size(RemoteButton)) {
        Icon(
            imageVector = Icons.Default.KeyboardArrowDown,
            contentDescription = viewModel.strings.get("close", "Close"),
            tint = Color.White,
            modifier = Modifier.size(32.dp),
        )
    }
}

/** Quality and chapters: what the remote capabilities leave of the local "more" menu; nothing when it has neither. */
@Composable
private fun RemoteMoreButton(viewModel: PlayerViewModel) {
    if (!RemoteMore.shows(viewModel.chapters.size, viewModel.qualityMenu.size)) return
    MoreMenu(viewModel, compact = false) { open ->
        IconButton(onClick = open, modifier = Modifier.size(RemoteButton)) {
            Icon(Icons.Default.MoreVert, contentDescription = viewModel.strings.get("more", "More"), tint = Color.White)
        }
    }
}

/**
 * The TV's name with the Cast icon; opens the Cast sheet, which points at it. In the active color: the screen only
 * stands while a TV plays, so its TV is the connected one.
 */
@Composable
private fun RemoteTargetButton(viewModel: PlayerViewModel, targetName: String?, modifier: Modifier = Modifier) {
    var anchor by remember { mutableStateOf<Rect?>(null) }
    Row(
        modifier = modifier
            .heightIn(min = RemoteButton)
            .clip(RoundedCornerShape(8.dp))
            .clickable { anchor?.let(viewModel::openOutputSheet) }
            .onGloballyPositioned { coordinates ->
                val b = coordinates.boundsInWindow()
                anchor = Rect(b.left.roundToInt(), b.top.roundToInt(), b.right.roundToInt(), b.bottom.roundToInt())
            }
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ActiveIcon(
            icon = Icons.Default.Cast,
            description = RemoteSpeech.targetButton(targetName, viewModel.castButtonLabel, viewModel.castButtonState),
            active = true,
        )
        targetName?.let { name ->
            Spacer(Modifier.width(8.dp))
            // The icon's description already says the name; the text would say it twice.
            Text(
                text = name,
                color = activeColor(),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
    }
}

/**
 * Episodes, audio and subtitles, each when it has something to offer; subtitles light up while on. Audio and subtitles
 * rest while nothing is loaded on the TV: a track change would have nothing to act on.
 */
@Composable
private fun RemoteTrackButtons(viewModel: PlayerViewModel, tracksEnabled: Boolean) {
    if (viewModel.episodeList.isNotEmpty() && !viewModel.syncPlayActive) {
        ActiveIconButton(Icons.AutoMirrored.Filled.FormatListBulleted, viewModel.strings.get("episodes", "Episodes"), active = false) {
            viewModel.showEpisodeList = true
        }
    }
    if (viewModel.audioMenu.isNotEmpty()) {
        AudioMenu(viewModel) { open ->
            Box(Modifier.inert(!tracksEnabled)) {
                ActiveIconButton(Icons.Default.GraphicEq, viewModel.strings.get("audio", "Audio"), active = false, enabled = tracksEnabled, onClick = open)
            }
        }
    }
    if (viewModel.subtitleMenu.isNotEmpty()) {
        val on = RemoteActive.subtitlesOn(viewModel.subtitleMenu.firstOrNull { it.selected }?.jellyfinIndex)
        SubtitleMenu(viewModel) { open ->
            Box(Modifier.inert(!tracksEnabled)) {
                ActiveIconButton(Icons.Default.ClosedCaption, viewModel.strings.get("subtitles", "Subtitles"), active = on, enabled = tracksEnabled, onClick = open)
            }
        }
    }
}

@Composable
private fun ActiveIconButton(icon: ImageVector, description: String, active: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(RemoteButton), enabled = enabled) {
        ActiveIcon(icon, description, active)
    }
}

/** An icon in the active color with a dot under it while [active], white otherwise; the dot keeps its room. */
@Composable
private fun ActiveIcon(icon: ImageVector, description: String?, active: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Spacer(Modifier.size(7.dp))
        val accent = activeColor()
        Icon(icon, contentDescription = description, tint = if (active) accent else Color.White, modifier = Modifier.size(22.dp))
        Box(
            Modifier
                .padding(top = 3.dp)
                .size(4.dp)
                .clip(CircleShape)
                .background(if (active) accent else Color.Transparent),
        )
    }
}
