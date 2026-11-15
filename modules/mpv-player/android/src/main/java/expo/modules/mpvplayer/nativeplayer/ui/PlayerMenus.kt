package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.RotateRight
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel

// The chrome's menus, apart from the bar that shows them: the local top bar and the remote screen's rows open
// the same ones. Each takes the content of its button, called with what opens the menu; the menu reads the
// capabilities as it did in the bar. Twin: PlayerMenus.swift.

/** Playback speed presets. */
@Composable
fun SpeedMenu(
    viewModel: PlayerViewModel,
    button: @Composable (open: () -> Unit) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        button {
            expanded = true
            viewModel.menuInteractionStarted()
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = {
                expanded = false
                viewModel.scheduleAutoHide()
            }
        ) {
            PlayerConstants.SPEED_PRESETS.forEach { opt ->
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(speedLabel(opt))
                            if (kotlin.math.abs(viewModel.speed - opt) < 0.01) {
                                Spacer(modifier = Modifier.width(8.dp))
                                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                        }
                    },
                    onClick = {
                        viewModel.setSpeed(opt)
                        expanded = false
                    }
                )
            }
        }
    }
}

/** Audio tracks, then mpv's audio sync, volume boost, dialogue boost and mono downmix. */
@Composable
fun AudioMenu(
    viewModel: PlayerViewModel,
    button: @Composable (open: () -> Unit) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        button {
            expanded = true
            viewModel.menuInteractionStarted()
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = {
                expanded = false
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
                        expanded = false
                    }
                )
            }

            // The blocks below drive mpv-only engine calls (no-ops on
            // the Media3 engine) — hidden for an exo session.
            if (viewModel.isMpvEngine && viewModel.capabilities.decoderSettings) {
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
                                Text(syncOffsetLabel(offset))
                                if (kotlin.math.abs(viewModel.audioDelay - offset) < 0.01) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                }
                            }
                        },
                        onClick = {
                            viewModel.setAudioDelay(offset)
                            expanded = false
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
                            expanded = false
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
                        expanded = false
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
                        expanded = false
                    }
                )
            }
        }
    }
}

/** Subtitle tracks, then size, sync and the subtitle search. */
@Composable
fun SubtitleMenu(
    viewModel: PlayerViewModel,
    button: @Composable (open: () -> Unit) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        button {
            expanded = true
            viewModel.menuInteractionStarted()
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = {
                expanded = false
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
                        expanded = false
                    }
                )
            }

            HorizontalDivider()

            if (!viewModel.subtitleScaleLocked && viewModel.capabilities.decoderSettings) {
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
                        expanded = false
                        viewModel.subtitleScaleOverlayActivity++
                        viewModel.showSubtitleScaleOverlay = true
                    }
                )
                HorizontalDivider()
            }

            if (viewModel.capabilities.decoderSettings) {
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
                                Text(syncOffsetLabel(offset))
                                if (kotlin.math.abs(viewModel.subtitleDelay - offset) < 0.01) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                }
                            }
                        },
                        onClick = {
                            viewModel.setSubtitleDelay(offset)
                            expanded = false
                        }
                    )
                }
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
                        expanded = false
                        viewModel.openSubtitleSearch()
                    }
                )
            }
        }
    }
}

/** Zoom when the bar is compact, quality, chapters, sleep timer, rotate, lock and technical info. */
@Composable
fun MoreMenu(
    viewModel: PlayerViewModel,
    compact: Boolean,
    button: @Composable (open: () -> Unit) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        button {
            expanded = true
            viewModel.menuInteractionStarted()
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = {
                expanded = false
                viewModel.scheduleAutoHide()
            }
        ) {
            if (compact && viewModel.capabilities.zoom) {
                DropdownMenuItem(
                    text = { Text(viewModel.strings.get("zoomToFill", "Zoom to Fill")) },
                    onClick = {
                        viewModel.toggleZoomToFill()
                        expanded = false
                    }
                )
                HorizontalDivider()
            }

            // Quality options
            QualityMenuItems(viewModel) { expanded = false }

            // Chapters
            ChapterMenuItems(viewModel) { expanded = false }

            // Sleep Timer
            if (!viewModel.syncPlayActive && viewModel.capabilities.sleepTimer) {
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
                            expanded = false
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
                            expanded = false
                        }
                    )
                }
            }

            HorizontalDivider()

            // Rotate
            if (viewModel.capabilities.rotate) DropdownMenuItem(
                text = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.RotateRight, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(viewModel.strings.get("rotate", "Rotate"))
                    }
                },
                onClick = {
                    viewModel.requestRotate()
                    expanded = false
                }
            )

            // Lock Controls
            if (viewModel.capabilities.lockControls) DropdownMenuItem(
                text = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(viewModel.strings.get("lockControls", "Lock Controls"))
                    }
                },
                onClick = {
                    viewModel.lockControls()
                    expanded = false
                }
            )

            if (viewModel.capabilities.technicalInfo) {
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
                        expanded = false
                    }
                )
            }
        }
    }
}

/** The quality choices, as a section of a menu; [onPicked] closes that menu. */
@Composable
fun ColumnScope.QualityMenuItems(viewModel: PlayerViewModel, onPicked: () -> Unit) {
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
                    onPicked()
                }
            )
        }
        HorizontalDivider()
    }
}

/** The chapters, each seeking to its start, as a section of a menu; [onPicked] closes that menu. */
@Composable
fun ColumnScope.ChapterMenuItems(viewModel: PlayerViewModel, onPicked: () -> Unit) {
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
                    onPicked()
                }
            )
        }
        HorizontalDivider()
    }
}
