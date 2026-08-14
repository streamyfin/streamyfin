package expo.modules.mpvplayer.nativeplayer.ui.tv

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Forward30
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.Replay30
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.IconButton
import androidx.tv.material3.IconButtonDefaults
import androidx.tv.material3.Text
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.TvMenuScreen
import kotlinx.coroutines.delay

enum class TvControl {
    PREV_EPISODE,
    SKIP_BACK,
    PREV_CHAPTER,
    PLAY_PAUSE,
    NEXT_CHAPTER,
    SKIP_FORWARD,
    NEXT_EPISODE,
    SKIP_SEGMENT,
    EPISODES,
    CHAPTERS,
    QUALITY,
    AUDIO,
    SUBTITLES,
    SPEED,
    MORE
}

@Composable
fun TvControlsRow(
    viewModel: PlayerViewModel,
    lastFocused: TvControl?,
    onControlFocused: (TvControl) -> Unit,
    modifier: Modifier = Modifier
) {
    val isEpisode = viewModel.metadata?.isEpisode == true
    val hasChapters = viewModel.chapters.isNotEmpty()
    val hasEpisodes = viewModel.episodeList.isNotEmpty()
    val hasQuality = viewModel.qualityMenu.isNotEmpty()
    val hasAudio = viewModel.audioMenu.isNotEmpty()
    val hasSubtitles = viewModel.subtitleMenu.isNotEmpty() || viewModel.uiOptions.subtitleSearchEnabled
    val activeSegment = viewModel.activeSegment

    fun isAvailable(control: TvControl): Boolean = when (control) {
        TvControl.PREV_EPISODE, TvControl.NEXT_EPISODE -> isEpisode
        TvControl.PREV_CHAPTER, TvControl.NEXT_CHAPTER, TvControl.CHAPTERS -> hasChapters
        TvControl.EPISODES -> hasEpisodes
        TvControl.QUALITY -> hasQuality
        TvControl.AUDIO -> hasAudio
        TvControl.SUBTITLES -> hasSubtitles
        TvControl.SKIP_SEGMENT -> activeSegment != null
        TvControl.SKIP_BACK, TvControl.SKIP_FORWARD, TvControl.PLAY_PAUSE, TvControl.SPEED, TvControl.MORE -> true
    }

    val defaultFocusTarget = if (lastFocused != null && isAvailable(lastFocused)) {
        lastFocused
    } else {
        TvControl.PLAY_PAUSE
    }

    val focusRequesters = remember {
        TvControl.entries.associateWith { FocusRequester() }
    }

    LaunchedEffect(Unit) {
        delay(40L)
        runCatching {
            focusRequesters[defaultFocusTarget]?.requestFocus()
        }
    }

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // --- Left Transport Cluster ---
        if (isEpisode) {
            TvIconButton(
                control = TvControl.PREV_EPISODE,
                icon = Icons.Filled.SkipPrevious,
                contentDescription = "Previous Episode",
                focusRequester = focusRequesters.getValue(TvControl.PREV_EPISODE),
                onFocused = onControlFocused,
                onClick = { viewModel.playPreviousEpisode() }
            )
        }

        val skipBackIcon = when (viewModel.uiOptions.seekBackwardSec.toInt()) {
            10 -> Icons.Filled.Replay10
            30 -> Icons.Filled.Replay30
            else -> Icons.Filled.Replay
        }
        TvIconButton(
            control = TvControl.SKIP_BACK,
            icon = skipBackIcon,
            contentDescription = "Skip Back",
            focusRequester = focusRequesters.getValue(TvControl.SKIP_BACK),
            onFocused = onControlFocused,
            onClick = { viewModel.seekBy(-viewModel.uiOptions.seekBackwardSec) }
        )

        if (hasChapters) {
            TvIconButton(
                control = TvControl.PREV_CHAPTER,
                icon = Icons.Filled.FastRewind,
                contentDescription = "Previous Chapter",
                focusRequester = focusRequesters.getValue(TvControl.PREV_CHAPTER),
                onFocused = onControlFocused,
                onClick = { viewModel.goToPreviousChapter() }
            )
        }

        TvIconButton(
            control = TvControl.PLAY_PAUSE,
            icon = if (viewModel.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
            contentDescription = if (viewModel.isPlaying) "Pause" else "Play",
            focusRequester = focusRequesters.getValue(TvControl.PLAY_PAUSE),
            onFocused = onControlFocused,
            onClick = { viewModel.togglePlayPause() }
        )

        if (hasChapters) {
            TvIconButton(
                control = TvControl.NEXT_CHAPTER,
                icon = Icons.Filled.FastForward,
                contentDescription = "Next Chapter",
                focusRequester = focusRequesters.getValue(TvControl.NEXT_CHAPTER),
                onFocused = onControlFocused,
                onClick = { viewModel.goToNextChapter() }
            )
        }

        val skipForwardIcon = when (viewModel.uiOptions.seekForwardSec.toInt()) {
            10 -> Icons.Filled.Forward10
            30 -> Icons.Filled.Forward30
            else -> Icons.Filled.FastForward
        }
        TvIconButton(
            control = TvControl.SKIP_FORWARD,
            icon = skipForwardIcon,
            contentDescription = "Skip Forward",
            focusRequester = focusRequesters.getValue(TvControl.SKIP_FORWARD),
            onFocused = onControlFocused,
            onClick = { viewModel.seekBy(viewModel.uiOptions.seekForwardSec) }
        )

        if (isEpisode) {
            TvIconButton(
                control = TvControl.NEXT_EPISODE,
                icon = Icons.Filled.SkipNext,
                contentDescription = "Next Episode",
                focusRequester = focusRequesters.getValue(TvControl.NEXT_EPISODE),
                onFocused = onControlFocused,
                onClick = { viewModel.playNextEpisode() }
            )
        }

        if (activeSegment != null) {
            val segmentLabel = if (activeSegment.type == "Intro") {
                viewModel.str("skipIntro", "Skip Intro")
            } else {
                viewModel.str("skipCredits", "Skip Credits")
            }
            Button(
                onClick = { viewModel.skipActiveSegment() },
                modifier = Modifier
                    .focusRequester(focusRequesters.getValue(TvControl.SKIP_SEGMENT))
                    .onFocusChanged {
                        if (it.isFocused) {
                            onControlFocused(TvControl.SKIP_SEGMENT)
                            viewModel.scheduleAutoHide()
                        }
                    },
                colors = ButtonDefaults.colors(
                    containerColor = Color(0xFF2E2E2E),
                    focusedContainerColor = Color.White,
                    contentColor = Color.White,
                    focusedContentColor = Color.Black
                )
            ) {
                Text(
                    text = segmentLabel,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // --- Right Options Cluster ---
        if (hasEpisodes) {
            TvIconButton(
                control = TvControl.EPISODES,
                icon = Icons.Filled.VideoLibrary,
                contentDescription = "Episodes",
                focusRequester = focusRequesters.getValue(TvControl.EPISODES),
                onFocused = onControlFocused,
                onClick = { viewModel.showEpisodeList = true }
            )
        }

        if (hasChapters) {
            TvIconButton(
                control = TvControl.CHAPTERS,
                icon = Icons.Filled.Bookmark,
                contentDescription = "Chapters",
                focusRequester = focusRequesters.getValue(TvControl.CHAPTERS),
                onFocused = onControlFocused,
                onClick = { viewModel.openTvMenu(TvMenuScreen.CHAPTERS) }
            )
        }

        if (hasQuality) {
            TvIconButton(
                control = TvControl.QUALITY,
                icon = Icons.Filled.Speed,
                contentDescription = "Quality",
                focusRequester = focusRequesters.getValue(TvControl.QUALITY),
                onFocused = onControlFocused,
                onClick = { viewModel.openTvMenu(TvMenuScreen.QUALITY) }
            )
        }

        if (hasAudio) {
            TvIconButton(
                control = TvControl.AUDIO,
                icon = Icons.Filled.VolumeUp,
                contentDescription = "Audio",
                focusRequester = focusRequesters.getValue(TvControl.AUDIO),
                onFocused = onControlFocused,
                onClick = { viewModel.openTvMenu(TvMenuScreen.AUDIO_ROOT) }
            )
        }

        if (hasSubtitles) {
            TvIconButton(
                control = TvControl.SUBTITLES,
                icon = Icons.Filled.ClosedCaption,
                contentDescription = "Subtitles",
                focusRequester = focusRequesters.getValue(TvControl.SUBTITLES),
                onFocused = onControlFocused,
                onClick = { viewModel.openTvMenu(TvMenuScreen.SUBTITLES_ROOT) }
            )
        }

        TvIconButton(
            control = TvControl.SPEED,
            icon = Icons.Filled.Timer,
            contentDescription = "Speed",
            focusRequester = focusRequesters.getValue(TvControl.SPEED),
            onFocused = onControlFocused,
            onClick = { viewModel.openTvMenu(TvMenuScreen.SPEED) }
        )

        TvIconButton(
            control = TvControl.MORE,
            icon = Icons.Filled.MoreHoriz,
            contentDescription = "More",
            focusRequester = focusRequesters.getValue(TvControl.MORE),
            onFocused = onControlFocused,
            onClick = { viewModel.openTvMenu(TvMenuScreen.MORE) }
        )
    }
}

@Composable
private fun TvIconButton(
    control: TvControl,
    icon: ImageVector,
    contentDescription: String,
    focusRequester: FocusRequester,
    onFocused: (TvControl) -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    IconButton(
        onClick = onClick,
        modifier = modifier
            .focusRequester(focusRequester)
            .onFocusChanged {
                if (it.isFocused) {
                    onFocused(control)
                }
            },
        colors = IconButtonDefaults.colors(
            containerColor = Color(0xFF2E2E2E),
            focusedContainerColor = Color.White,
            contentColor = Color.White,
            focusedContentColor = Color.Black
        )
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(24.dp)
        )
    }
}
