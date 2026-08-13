package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.SubtitleSearchResultRecord

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubtitleSearchSheet(
    viewModel: PlayerViewModel,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var showLangMenu by remember { mutableStateOf(false) }

    val languages = viewModel.uiOptions.subtitleSearchLanguages
    val currentLangObj = languages.firstOrNull { it.code == viewModel.subtitleSearchLanguage }
    val langDisplayName = currentLangObj?.name ?: viewModel.subtitleSearchLanguage.uppercase()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color(0xFF1C1C1E)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp)
        ) {
            // Header: Title & Language Picker
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = viewModel.strings.get("searchSubtitles", "Search Subtitles"),
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )

                // Language selector pill
                if (languages.isNotEmpty()) {
                    Box {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color.White.copy(alpha = 0.1f))
                                .clickable { showLangMenu = true }
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = langDisplayName,
                                color = Color.White,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Icon(
                                imageVector = Icons.Default.ArrowDropDown,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        DropdownMenu(
                            expanded = showLangMenu,
                            onDismissRequest = { showLangMenu = false }
                        ) {
                            languages.forEach { lang ->
                                DropdownMenuItem(
                                    text = { Text(lang.name) },
                                    onClick = {
                                        viewModel.searchSubtitles(lang.code)
                                        showLangMenu = false
                                    }
                                )
                            }
                        }
                    }
                }
            }

            // Body based on state
            when (viewModel.subtitleSearchStatus) {
                "searching" -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = PlayerAccentColor)
                    }
                }
                "error" -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(140.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = viewModel.subtitleSearchError ?: viewModel.strings.get("searchFailed", "Search failed"),
                            color = Color.Red.copy(alpha = 0.8f),
                            fontSize = 14.sp
                        )
                    }
                }
                else -> {
                    if (viewModel.subtitleSearchResults.isEmpty() && viewModel.subtitleSearchStatus != "idle") {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(140.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = viewModel.strings.get("noSubtitlesFound", "No subtitles found"),
                                color = Color.White.copy(alpha = 0.6f),
                                fontSize = 14.sp
                            )
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            items(viewModel.subtitleSearchResults) { result ->
                                SubtitleResultRow(
                                    result = result,
                                    isDownloading = (viewModel.downloadingResultId == result.id),
                                    onDownload = { viewModel.downloadSubtitle(result.id) }
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SubtitleResultRow(
    result: SubtitleSearchResultRecord,
    isDownloading: Boolean,
    onDownload: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Color.White.copy(alpha = 0.06f))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = result.name,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(4.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Provider
                Text(
                    text = result.providerName,
                    color = Color.White.copy(alpha = 0.5f),
                    fontSize = 11.sp
                )

                // Hash Match Badge
                if (result.isHashMatch) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(PlayerAccentColor.copy(alpha = 0.25f))
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    ) {
                        Text(text = "MATCH", color = PlayerAccentColor, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                }

                // Hearing Impaired Badge
                if (result.hearingImpaired) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color.White.copy(alpha = 0.15f))
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    ) {
                        Text(text = "SDH", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Download Action
        if (isDownloading) {
            CircularProgressIndicator(
                color = PlayerAccentColor,
                modifier = Modifier.size(24.dp),
                strokeWidth = 2.dp
            )
        } else {
            IconButton(
                onClick = onDownload,
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Download,
                    contentDescription = "Download Subtitle",
                    tint = PlayerAccentColor
                )
            }
        }
    }
}
