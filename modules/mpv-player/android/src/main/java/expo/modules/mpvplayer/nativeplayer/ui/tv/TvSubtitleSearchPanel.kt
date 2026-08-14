package expo.modules.mpvplayer.nativeplayer.ui.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Hearing
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ListItem
import androidx.tv.material3.ListItemDefaults
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.Text
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.SubtitleSearchResultRecord

@Composable
fun TvSubtitleSearchPanel(
    viewModel: PlayerViewModel,
    modifier: Modifier = Modifier
) {
    val langFocusRequester = remember { FocusRequester() }
    val firstResultFocusRequester = remember { FocusRequester() }
    var showLanguagePicker by remember { mutableStateOf(false) }

    val results = viewModel.subtitleSearchResults
    val status = viewModel.subtitleSearchStatus

    LaunchedEffect(results.size) {
        if (results.isNotEmpty()) {
            try {
                firstResultFocusRequester.requestFocus()
            } catch (_: Exception) {}
        } else if (!showLanguagePicker) {
            try {
                langFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    val currentLangName = remember(viewModel.subtitleSearchLanguage, viewModel.uiOptions.subtitleSearchLanguages) {
        viewModel.uiOptions.subtitleSearchLanguages.firstOrNull { it.code == viewModel.subtitleSearchLanguage }?.name
            ?: viewModel.subtitleSearchLanguage.uppercase()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.7f)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .size(width = 960.dp, height = 640.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xFF1A1A1A))
                .padding(32.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = viewModel.str("searchSubtitles", "Search Subtitles"),
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )

                Button(
                    onClick = { showLanguagePicker = !showLanguagePicker },
                    modifier = Modifier.focusRequester(langFocusRequester)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Language,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            text = currentLangName,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Body
            if (showLanguagePicker) {
                // Language selection list
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(vertical = 8.dp)
                ) {
                    itemsIndexed(viewModel.uiOptions.subtitleSearchLanguages) { index, lang ->
                        val isSelected = lang.code == viewModel.subtitleSearchLanguage
                        val itemFocusRequester = remember { FocusRequester() }
                        if (index == 0) {
                            LaunchedEffect(Unit) {
                                try { itemFocusRequester.requestFocus() } catch (_: Exception) {}
                            }
                        }

                        ListItem(
                            selected = isSelected,
                            onClick = {
                                showLanguagePicker = false
                                viewModel.searchSubtitles(lang.code)
                            },
                            headlineContent = {
                                Text(
                                    text = lang.name,
                                    fontSize = 18.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                )
                            },
                            trailingContent = if (isSelected) {
                                {
                                    // Follows the row's focus state: white on
                                    // the dark row, black on the focused one.
                                    Icon(
                                        imageVector = Icons.Filled.Check,
                                        contentDescription = null,
                                        tint = LocalContentColor.current
                                    )
                                }
                            } else null,
                            colors = ListItemDefaults.colors(
                                containerColor = TvPalette.RowFill,
                                focusedContainerColor = TvPalette.FocusFill,
                                contentColor = TvPalette.OnSurface,
                                focusedContentColor = TvPalette.OnFocus
                            ),
                            modifier = if (index == 0) Modifier.focusRequester(itemFocusRequester) else Modifier
                        )
                    }
                }
            } else {
                when (status) {
                    "searching" -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(color = Color.White)
                        }
                    }
                    "error" -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(
                                    imageVector = Icons.Filled.Warning,
                                    contentDescription = null,
                                    tint = Color(0xFFFFCC00),
                                    modifier = Modifier.size(48.dp)
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(
                                    text = viewModel.str("searchFailed", "Search failed"),
                                    color = Color.White,
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                if (!viewModel.subtitleSearchError.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        text = viewModel.subtitleSearchError ?: "",
                                        color = Color.White.copy(alpha = 0.7f),
                                        fontSize = 15.sp,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }
                    }
                    else -> {
                        if (results.isEmpty()) {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = viewModel.str("noSubtitlesFound", "No subtitles found"),
                                    color = Color.White.copy(alpha = 0.7f),
                                    fontSize = 18.sp
                                )
                            }
                        } else {
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                                contentPadding = PaddingValues(vertical = 8.dp)
                            ) {
                                itemsIndexed(results, key = { _, item -> item.id }) { index, result ->
                                    TvSubtitleResultRow(
                                        result = result,
                                        isDownloading = viewModel.downloadingResultId == result.id,
                                        downloadDisabled = viewModel.downloadingResultId != null,
                                        onClick = { viewModel.downloadSubtitle(result.id) },
                                        modifier = if (index == 0) Modifier.focusRequester(firstResultFocusRequester) else Modifier
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TvSubtitleResultRow(
    result: SubtitleSearchResultRecord,
    isDownloading: Boolean,
    downloadDisabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ListItem(
        selected = false,
        onClick = onClick,
        enabled = !downloadDisabled,
        headlineContent = {
            Text(
                text = result.name,
                fontSize = 17.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        },
        supportingContent = {
            // Everything here derives from LocalContentColor — the ListItem
            // swaps it white↔black with focus, and hardcoded whites vanish
            // against the focused row's white fill.
            val content = LocalContentColor.current
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.padding(top = 4.dp)
            ) {
                // Provider Badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(content.copy(alpha = 0.15f))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = result.providerName,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = content
                    )
                }

                if (!result.format.isNullOrBlank()) {
                    Text(
                        text = (result.format ?: "").uppercase(),
                        fontSize = 13.sp,
                        color = content.copy(alpha = 0.7f)
                    )
                }

                val rating = result.communityRating
                if (rating != null && rating > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Filled.Star,
                            contentDescription = null,
                            tint = Color(0xFFFFCC00),
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(2.dp))
                        Text(
                            text = String.format("%.1f", rating),
                            fontSize = 13.sp,
                            color = content.copy(alpha = 0.7f)
                        )
                    }
                }

                if (result.hearingImpaired) {
                    Icon(
                        imageVector = Icons.Filled.Hearing,
                        contentDescription = "SDH",
                        tint = content.copy(alpha = 0.7f),
                        modifier = Modifier.size(14.dp)
                    )
                }

                if (result.aiTranslated) {
                    Text(
                        text = "AI",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = content.copy(alpha = 0.7f)
                    )
                }
            }
        },
        trailingContent = {
            if (isDownloading) {
                CircularProgressIndicator(
                    color = LocalContentColor.current,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(22.dp)
                )
            } else if (result.isHashMatch) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = "Match",
                    tint = Color(0xFF4CAF50),
                    modifier = Modifier.size(22.dp)
                )
            }
        },
        colors = ListItemDefaults.colors(
            containerColor = TvPalette.RowFill,
            focusedContainerColor = TvPalette.FocusFill,
            contentColor = TvPalette.OnSurface,
            focusedContentColor = TvPalette.OnFocus
        ),
        modifier = modifier
    )
}
