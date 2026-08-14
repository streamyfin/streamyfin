package expo.modules.mpvplayer.nativeplayer.ui.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ListItem
import androidx.tv.material3.ListItemDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.SurfaceDefaults
import androidx.tv.material3.Text
import androidx.tv.material3.darkColorScheme
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.TrackMenuItemRecord
import expo.modules.mpvplayer.nativeplayer.TvMenuScreen
import expo.modules.mpvplayer.nativeplayer.ui.formatTimeSec
import kotlin.math.abs
import kotlin.math.roundToInt

@Composable
fun TvPlayerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color.White,
            onPrimary = Color.Black,
            surface = Color(0xFF1E1E1E),
            onSurface = Color.White,
            background = Color.Black,
            onBackground = Color.White
        ),
        content = content
    )
}

@Composable
fun TvMenuPanel(
    viewModel: PlayerViewModel,
    modifier: Modifier = Modifier
) {
    val currentScreen = viewModel.tvMenuRoute.lastOrNull() ?: return

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
    ) {
        Surface(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .fillMaxHeight()
                .width(460.dp),
            colors = SurfaceDefaults.colors(
                containerColor = Color(0xFF181818).copy(alpha = 0.96f)
            ),
            shape = RoundedCornerShape(topStart = 24.dp, bottomStart = 24.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 24.dp, vertical = 28.dp)
            ) {
                val headerTitle = when (currentScreen) {
                    TvMenuScreen.CHAPTERS -> viewModel.str("chapters", "Chapters")
                    TvMenuScreen.QUALITY -> viewModel.str("quality", "Quality")
                    TvMenuScreen.AUDIO_ROOT -> viewModel.str("audio", "Audio")
                    TvMenuScreen.AUDIO_SYNC -> viewModel.str("audioSync", "Audio sync")
                    TvMenuScreen.VOLUME_BOOST -> viewModel.str("volumeBoost", "Volume boost")
                    TvMenuScreen.SUBTITLES_ROOT -> viewModel.str("subtitles", "Subtitles")
                    TvMenuScreen.SUBTITLE_SIZE -> viewModel.str("subtitleSize", "Subtitle size")
                    TvMenuScreen.SUBTITLE_SYNC -> viewModel.str("subtitleSync", "Subtitle sync")
                    TvMenuScreen.SPEED -> viewModel.str("speed", "Speed")
                    TvMenuScreen.MORE -> viewModel.str("playback_options", "More")
                }

                Text(
                    text = headerTitle,
                    color = Color.White,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                )

                Spacer(modifier = Modifier.height(12.dp))

                when (currentScreen) {
                    TvMenuScreen.CHAPTERS -> ChaptersMenu(viewModel)
                    TvMenuScreen.QUALITY -> QualityMenu(viewModel)
                    TvMenuScreen.AUDIO_ROOT -> AudioRootMenu(viewModel)
                    TvMenuScreen.AUDIO_SYNC -> AudioSyncMenu(viewModel)
                    TvMenuScreen.VOLUME_BOOST -> VolumeBoostMenu(viewModel)
                    TvMenuScreen.SUBTITLES_ROOT -> SubtitlesRootMenu(viewModel)
                    TvMenuScreen.SUBTITLE_SIZE -> SubtitleSizeMenu(viewModel)
                    TvMenuScreen.SUBTITLE_SYNC -> SubtitleSyncMenu(viewModel)
                    TvMenuScreen.SPEED -> SpeedMenu(viewModel)
                    TvMenuScreen.MORE -> MoreMenu(viewModel)
                }
            }
        }
    }
}

@Composable
private fun ChaptersMenu(viewModel: PlayerViewModel) {
    val chapters = viewModel.chapters
    val currentIdx = viewModel.currentChapterIndex()
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        itemsIndexed(chapters) { index, chapter ->
            val isSelected = index == currentIdx
            val label = "${chapter.name ?: "${index + 1}"} — ${formatTimeSec(chapter.startSec)}"
            TvMenuRow(
                label = label,
                selected = isSelected,
                onClick = {
                    viewModel.seekTo(chapter.startSec)
                    viewModel.closeTvMenu()
                },
                modifier = if (index == 0) Modifier.focusRequester(firstFocus) else Modifier
            )
        }
    }
}

@Composable
private fun QualityMenu(viewModel: PlayerViewModel) {
    val items = viewModel.qualityMenu
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        itemsIndexed(items) { index, item ->
            TvMenuRow(
                label = item.label,
                selected = item.selected,
                onClick = {
                    viewModel.selectQuality(item)
                    viewModel.closeTvMenu()
                },
                modifier = if (index == 0) Modifier.focusRequester(firstFocus) else Modifier
            )
        }
    }
}

@Composable
private fun AudioRootMenu(viewModel: PlayerViewModel) {
    val items = viewModel.audioMenu
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        itemsIndexed(items) { index, item ->
            TvMenuRow(
                label = item.label,
                selected = item.selected,
                onClick = { viewModel.selectAudio(item) },
                modifier = if (index == 0) Modifier.focusRequester(firstFocus) else Modifier
            )
        }

        item {
            TvSubmenuRow(
                label = viewModel.str("audioSync", "Audio sync"),
                onClick = { viewModel.pushTvMenu(TvMenuScreen.AUDIO_SYNC) }
            )
        }

        item {
            TvSubmenuRow(
                label = viewModel.str("volumeBoost", "Volume boost"),
                onClick = { viewModel.pushTvMenu(TvMenuScreen.VOLUME_BOOST) }
            )
        }

        item {
            TvMenuRow(
                label = viewModel.str("dialogueBoost", "Dialogue boost"),
                selected = viewModel.dialogueBoostEnabled,
                onClick = { viewModel.toggleDialogueBoost() }
            )
        }

        item {
            TvMenuRow(
                label = viewModel.str("monoAudio", "Mono audio"),
                selected = viewModel.monoAudioEnabled,
                onClick = { viewModel.toggleMonoAudio() }
            )
        }
    }
}

@Composable
private fun AudioSyncMenu(viewModel: PlayerViewModel) {
    val presets = PlayerConstants.SYNC_OFFSET_PRESETS
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        itemsIndexed(presets) { index, offset ->
            val isSelected = abs(viewModel.audioDelay - offset) < 0.001
            val label = if (offset == 0.0) "0 s" else String.format("%+g s", offset)
            TvMenuRow(
                label = label,
                selected = isSelected,
                onClick = { viewModel.setAudioDelay(offset) },
                modifier = if (index == 0) Modifier.focusRequester(firstFocus) else Modifier
            )
        }
    }
}

@Composable
private fun VolumeBoostMenu(viewModel: PlayerViewModel) {
    val presets = PlayerConstants.VOLUME_BOOST_PRESETS
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        itemsIndexed(presets) { index, percent ->
            val isSelected = viewModel.volumeBoostPercent == percent
            TvMenuRow(
                label = "$percent%",
                selected = isSelected,
                onClick = { viewModel.setVolumeBoost(percent) },
                modifier = if (index == 0) Modifier.focusRequester(firstFocus) else Modifier
            )
        }
    }
}

@Composable
private fun SubtitlesRootMenu(viewModel: PlayerViewModel) {
    val items = viewModel.subtitleMenu
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        itemsIndexed(items) { index, item ->
            TvMenuRow(
                label = item.label,
                selected = item.selected,
                onClick = { viewModel.selectSubtitle(item) },
                modifier = if (index == 0) Modifier.focusRequester(firstFocus) else Modifier
            )
        }

        item {
            TvSubmenuRow(
                label = viewModel.str("subtitleSize", "Subtitle size"),
                onClick = { viewModel.pushTvMenu(TvMenuScreen.SUBTITLE_SIZE) }
            )
        }

        item {
            TvSubmenuRow(
                label = viewModel.str("subtitleSync", "Subtitle sync"),
                onClick = { viewModel.pushTvMenu(TvMenuScreen.SUBTITLE_SYNC) }
            )
        }

        if (viewModel.uiOptions.subtitleSearchEnabled) {
            item {
                ListItem(
                    selected = false,
                    onClick = {
                        viewModel.closeTvMenu()
                        viewModel.controlsVisible = false
                        viewModel.openSubtitleSearch()
                    },
                    headlineContent = {
                        Text(
                            text = viewModel.str("searchSubtitles", "Search subtitles"),
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Medium
                        )
                    },
                    trailingContent = {
                        Icon(
                            imageVector = Icons.Filled.Search,
                            contentDescription = null,
                            tint = Color.White.copy(alpha = 0.7f),
                            modifier = Modifier.size(20.dp)
                        )
                    },
                    colors = ListItemDefaults.colors(
                        containerColor = Color(0xFF222222),
                        focusedContainerColor = Color.White,
                        contentColor = Color.White,
                        focusedContentColor = Color.Black
                    )
                )
            }
        }
    }
}

@Composable
private fun SubtitleSizeMenu(viewModel: PlayerViewModel) {
    val presets = PlayerConstants.SUBTITLE_SCALE_PRESETS
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        itemsIndexed(presets) { index, preset ->
            val isSelected = abs(viewModel.subtitleScale - preset) < 0.001
            val label = "${(preset * 100).roundToInt()}%"
            TvMenuRow(
                label = label,
                selected = isSelected,
                onClick = { viewModel.setSubtitleScale(preset) },
                modifier = if (index == 0) Modifier.focusRequester(firstFocus) else Modifier
            )
        }
    }
}

@Composable
private fun SubtitleSyncMenu(viewModel: PlayerViewModel) {
    val presets = PlayerConstants.SYNC_OFFSET_PRESETS
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        itemsIndexed(presets) { index, offset ->
            val isSelected = abs(viewModel.subtitleDelay - offset) < 0.001
            val label = if (offset == 0.0) "0 s" else String.format("%+g s", offset)
            TvMenuRow(
                label = label,
                selected = isSelected,
                onClick = { viewModel.setSubtitleDelay(offset) },
                modifier = if (index == 0) Modifier.focusRequester(firstFocus) else Modifier
            )
        }
    }
}

@Composable
private fun SpeedMenu(viewModel: PlayerViewModel) {
    val presets = PlayerConstants.SPEED_PRESETS
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        itemsIndexed(presets) { index, option ->
            val isSelected = abs(viewModel.speed - option) < 0.001
            val label = if (option == 1.0) "1×" else String.format("%g×", option)
            TvMenuRow(
                label = label,
                selected = isSelected,
                onClick = { viewModel.setSpeed(option) },
                modifier = if (index == 0) Modifier.focusRequester(firstFocus) else Modifier
            )
        }
    }
}

@Composable
private fun MoreMenu(viewModel: PlayerViewModel) {
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { firstFocus.requestFocus() } catch (_: Exception) {}
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        item {
            TvMenuRow(
                label = viewModel.str("zoomToFill", "Zoom to fill"),
                selected = viewModel.isZoomedToFill,
                onClick = { viewModel.toggleZoomToFill() },
                modifier = Modifier.focusRequester(firstFocus)
            )
        }

        item {
            TvMenuRow(
                label = viewModel.str("technicalInfo", "Technical info"),
                selected = viewModel.showTechnicalInfo,
                onClick = { viewModel.showTechnicalInfo = !viewModel.showTechnicalInfo }
            )
        }
    }
}

@Composable
private fun TvMenuRow(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ListItem(
        selected = selected,
        onClick = onClick,
        headlineContent = {
            Text(
                text = label,
                fontSize = 17.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium
            )
        },
        trailingContent = if (selected) {
            {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }
        } else null,
        colors = ListItemDefaults.colors(
            containerColor = Color(0xFF222222),
            focusedContainerColor = Color.White,
            contentColor = Color.White,
            focusedContentColor = Color.Black
        ),
        modifier = modifier
    )
}

@Composable
private fun TvSubmenuRow(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ListItem(
        selected = false,
        onClick = onClick,
        headlineContent = {
            Text(
                text = label,
                fontSize = 17.sp,
                fontWeight = FontWeight.Medium
            )
        },
        trailingContent = {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForwardIos,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.5f),
                modifier = Modifier.size(16.dp)
            )
        },
        colors = ListItemDefaults.colors(
            containerColor = Color(0xFF222222),
            focusedContainerColor = Color.White,
            contentColor = Color.White,
            focusedContentColor = Color.Black
        ),
        modifier = modifier
    )
}
