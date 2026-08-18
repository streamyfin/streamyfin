package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AspectRatio
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FormatListBulleted
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Nightlight
import androidx.compose.material.icons.filled.PictureInPicture
import androidx.compose.material.icons.filled.RotateRight
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.TextFormat
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.TrackMenuItemRecord

@Composable
fun PlayerTopBar(
    viewModel: PlayerViewModel,
    compact: Boolean = false,
    onPipClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    var showSpeedMenu by remember { mutableStateOf(false) }
    var showAudioMenu by remember { mutableStateOf(false) }
    var showSubtitleMenu by remember { mutableStateOf(false) }
    var showMoreMenu by remember { mutableStateOf(false) }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Close button
        IconButton(
            onClick = { viewModel.close() },
            modifier = Modifier.size(40.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = viewModel.strings.get("close", "Close"),
                tint = Color.White
            )
        }

        // Title and Subtitle
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 8.dp)
        ) {
            viewModel.metadata?.title?.let { title ->
                Text(
                    text = title,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            viewModel.metadata?.subtitle?.let { subtitle ->
                Text(
                    text = subtitle,
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        // PiP Button
        if (onPipClick != null) {
            IconButton(
                onClick = { onPipClick() },
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.PictureInPicture,
                    contentDescription = "Picture in Picture",
                    tint = Color.White
                )
            }
        }

        // Zoom to fill button (if not compact)
        if (!compact) {
            IconButton(
                onClick = { viewModel.toggleZoomToFill() },
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.AspectRatio,
                    contentDescription = viewModel.strings.get("zoomToFill", "Zoom to Fill"),
                    tint = if (viewModel.isZoomedToFill) PlayerAccentColor else Color.White
                )
            }
        }

        // Episode list button
        if (viewModel.episodeList.isNotEmpty()) {
            IconButton(
                onClick = {
                    viewModel.showEpisodeList = true
                    viewModel.scheduleAutoHide()
                },
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.FormatListBulleted,
                    contentDescription = viewModel.strings.get("episodes", "Episodes"),
                    tint = Color.White
                )
            }
        }

        // Speed Menu Button (if not compact)
        if (!compact) {
            Box {
                IconButton(
                    onClick = {
                        showSpeedMenu = true
                        viewModel.menuInteractionStarted()
                    },
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Speed,
                        contentDescription = viewModel.strings.get("speed", "Speed"),
                        tint = Color.White
                    )
                }

                DropdownMenu(
                    expanded = showSpeedMenu,
                    onDismissRequest = {
                        showSpeedMenu = false
                        viewModel.scheduleAutoHide()
                    }
                ) {
                    PlayerConstants.SPEED_PRESETS.forEach { opt ->
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(if (opt == 1.0) "1×" else "${opt}×")
                                    if (kotlin.math.abs(viewModel.speed - opt) < 0.01) {
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            onClick = {
                                viewModel.setSpeed(opt)
                                showSpeedMenu = false
                            }
                        )
                    }
                }
            }
        }

        // Audio Menu
        if (viewModel.audioMenu.isNotEmpty()) {
            Box {
                IconButton(
                    onClick = {
                        showAudioMenu = true
                        viewModel.menuInteractionStarted()
                    },
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.GraphicEq,
                        contentDescription = viewModel.strings.get("audio", "Audio"),
                        tint = Color.White
                    )
                }

                DropdownMenu(
                    expanded = showAudioMenu,
                    onDismissRequest = {
                        showAudioMenu = false
                        viewModel.scheduleAutoHide()
                    }
                ) {
                    Text(
                        text = viewModel.strings.get("audio", "Audio Tracks"),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = Color.Gray,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )

                    viewModel.audioMenu.forEach { item ->
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(item.label)
                                    if (item.selected) {
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            onClick = {
                                viewModel.selectAudio(item)
                                showAudioMenu = false
                            }
                        )
                    }

                    HorizontalDivider()

                    // Sync Delays
                    Text(
                        text = viewModel.strings.get("audioSync", "Audio Sync"),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = Color.Gray,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                    PlayerConstants.SYNC_OFFSET_PRESETS.forEach { offset ->
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(if (offset == 0.0) "0 s" else "${offset} s")
                                    if (kotlin.math.abs(viewModel.audioDelay - offset) < 0.01) {
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            onClick = {
                                viewModel.setAudioDelay(offset)
                                showAudioMenu = false
                            }
                        )
                    }

                    HorizontalDivider()

                    // Volume Boost
                    Text(
                        text = viewModel.strings.get("volumeBoost", "Volume Boost"),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = Color.Gray,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                    PlayerConstants.VOLUME_BOOST_PRESETS.forEach { percent ->
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(if (percent == 100) viewModel.strings.get("off", "Off") else "$percent%")
                                    if (viewModel.volumeBoostPercent == percent) {
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            onClick = {
                                viewModel.setVolumeBoost(percent)
                                showAudioMenu = false
                            }
                        )
                    }

                    HorizontalDivider()

                    // Dialogue Boost
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(viewModel.strings.get("dialogueBoost", "Dialogue Boost"))
                                if (viewModel.dialogueBoostEnabled) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                }
                            }
                        },
                        onClick = {
                            viewModel.toggleDialogueBoost()
                            showAudioMenu = false
                        }
                    )

                    // Mono Downmix
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(viewModel.strings.get("monoAudio", "Mono Audio"))
                                if (viewModel.monoAudioEnabled) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                }
                            }
                        },
                        onClick = {
                            viewModel.toggleMonoAudio()
                            showAudioMenu = false
                        }
                    )
                }
            }
        }

        // Subtitles Menu
        if (viewModel.subtitleMenu.isNotEmpty()) {
            Box {
                IconButton(
                    onClick = {
                        showSubtitleMenu = true
                        viewModel.menuInteractionStarted()
                    },
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ClosedCaption,
                        contentDescription = viewModel.strings.get("subtitles", "Subtitles"),
                        tint = Color.White
                    )
                }

                DropdownMenu(
                    expanded = showSubtitleMenu,
                    onDismissRequest = {
                        showSubtitleMenu = false
                        viewModel.scheduleAutoHide()
                    }
                ) {
                    Text(
                        text = viewModel.strings.get("subtitles", "Subtitles"),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = Color.Gray,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )

                    viewModel.subtitleMenu.forEach { item ->
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(item.label)
                                    if (item.selected) {
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            onClick = {
                                viewModel.selectSubtitle(item)
                                showSubtitleMenu = false
                            }
                        )
                    }

                    HorizontalDivider()

                    if (!viewModel.subtitleScaleLocked) {
                        Text(
                            text = viewModel.strings.get("subtitleSize", "Subtitle Size"),
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = Color.Gray,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                        )
                        DropdownMenuItem(
                            text = { Text("${viewModel.subtitleScale}×") },
                            onClick = {
                                showSubtitleMenu = false
                                viewModel.subtitleScaleOverlayActivity++
                                viewModel.showSubtitleScaleOverlay = true
                            }
                        )
                        HorizontalDivider()
                    }

                    // Subtitle Sync
                    Text(
                        text = viewModel.strings.get("subtitleSync", "Subtitle Sync"),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = Color.Gray,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                    PlayerConstants.SYNC_OFFSET_PRESETS.forEach { offset ->
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(if (offset == 0.0) "0 s" else "${offset} s")
                                    if (kotlin.math.abs(viewModel.subtitleDelay - offset) < 0.01) {
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            onClick = {
                                viewModel.setSubtitleDelay(offset)
                                showSubtitleMenu = false
                            }
                        )
                    }

                    if (viewModel.uiOptions.subtitleSearchEnabled) {
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(viewModel.strings.get("searchSubtitles", "Search Subtitles"))
                                }
                            },
                            onClick = {
                                showSubtitleMenu = false
                                viewModel.openSubtitleSearch()
                            }
                        )
                    }
                }
            }
        }

        // More Menu
        Box {
            IconButton(
                onClick = {
                    showMoreMenu = true
                    viewModel.menuInteractionStarted()
                },
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.MoreVert,
                    contentDescription = "More",
                    tint = Color.White
                )
            }

            DropdownMenu(
                expanded = showMoreMenu,
                onDismissRequest = {
                    showMoreMenu = false
                    viewModel.scheduleAutoHide()
                }
            ) {
                if (compact) {
                    DropdownMenuItem(
                        text = { Text(viewModel.strings.get("zoomToFill", "Zoom to Fill")) },
                        onClick = {
                            viewModel.toggleZoomToFill()
                            showMoreMenu = false
                        }
                    )
                    HorizontalDivider()
                }

                // Quality options
                if (viewModel.qualityMenu.isNotEmpty()) {
                    Text(
                        text = viewModel.strings.get("quality", "Quality"),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = Color.Gray,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                    viewModel.qualityMenu.forEach { q ->
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(q.label)
                                    if (q.selected) {
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            onClick = {
                                viewModel.selectQuality(q)
                                showMoreMenu = false
                            }
                        )
                    }
                    HorizontalDivider()
                }

                // Chapters
                if (viewModel.chapters.isNotEmpty()) {
                    Text(
                        text = viewModel.strings.get("chapters", "Chapters"),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = Color.Gray,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                    viewModel.chapters.forEachIndexed { i, ch ->
                        DropdownMenuItem(
                            text = { Text("${ch.name ?: "${i + 1}"} — ${formatTimeSec(ch.startSec)}") },
                            onClick = {
                                viewModel.seekTo(ch.startSec)
                                showMoreMenu = false
                            }
                        )
                    }
                    HorizontalDivider()
                }

                // Sleep Timer
                Text(
                    text = viewModel.strings.get("sleepTimer", "Sleep Timer"),
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = Color.Gray,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                )
                if (viewModel.sleepTimerMinutes != null) {
                    DropdownMenuItem(
                        text = { Text(viewModel.strings.get("sleepTimerOff", "Turn Off")) },
                        onClick = {
                            viewModel.cancelSleepTimer()
                            showMoreMenu = false
                        }
                    )
                }
                PlayerConstants.SLEEP_TIMER_PRESET_MINUTES.forEach { mins ->
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(if (mins < 60) "$mins min" else "${mins / 60} h")
                                if (viewModel.sleepTimerMinutes == mins) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                }
                            }
                        },
                        onClick = {
                            viewModel.setSleepTimer(mins)
                            showMoreMenu = false
                        }
                    )
                }

                HorizontalDivider()

                // Rotate
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.RotateRight, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(viewModel.strings.get("rotate", "Rotate"))
                        }
                    },
                    onClick = {
                        viewModel.requestRotate()
                        showMoreMenu = false
                    }
                )

                // Lock Controls
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(viewModel.strings.get("lockControls", "Lock Controls"))
                        }
                    },
                    onClick = {
                        viewModel.lockControls()
                        showMoreMenu = false
                    }
                )

                // Technical Info
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(viewModel.strings.get("technicalInfo", "Technical Info"))
                        }
                    },
                    onClick = {
                        viewModel.showTechnicalInfo = !viewModel.showTechnicalInfo
                        showMoreMenu = false
                    }
                )
            }
        }
    }
}

fun formatTimeSec(seconds: Double): String {
    val total = seconds.toInt().coerceAtLeast(0)
    val hrs = total / 3600
    val mins = (total % 3600) / 60
    val secs = total % 60
    return if (hrs > 0) {
        String.format("%d:%02d:%02d", hrs, mins, secs)
    } else {
        String.format("%d:%02d", mins, secs)
    }
}
