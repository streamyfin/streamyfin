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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import expo.modules.mpvplayer.nativeplayer.EpisodeListItemRecord
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.ui.RemoteImage
import kotlinx.coroutines.delay

@Composable
fun TvEpisodeShelf(
    viewModel: PlayerViewModel,
    modifier: Modifier = Modifier
) {
    val episodes = viewModel.episodeList
    val nowPlayingIndex = remember(episodes) {
        val idx = episodes.indexOfFirst { it.isCurrent }
        if (idx >= 0) idx else 0
    }

    val listState = rememberLazyListState()
    val nowPlayingFocusRequester = remember { FocusRequester() }

    LaunchedEffect(nowPlayingIndex) {
        if (episodes.isNotEmpty()) {
            listState.scrollToItem(nowPlayingIndex)
            // One frame retry for Compose focus
            delay(50L)
            runCatching {
                nowPlayingFocusRequester.requestFocus()
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color.Black.copy(alpha = 0f),
                        Color.Black.copy(alpha = 0.75f),
                        Color.Black.copy(alpha = 0.95f)
                    )
                )
            )
            .padding(vertical = 28.dp),
        contentAlignment = Alignment.BottomStart
    ) {
        Column {
            Text(
                text = viewModel.str("episodes", "Episodes"),
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = TvMetrics.INSET_H)
            )

            Spacer(modifier = Modifier.height(18.dp))

            LazyRow(
                state = listState,
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                contentPadding = PaddingValues(horizontal = TvMetrics.INSET_H)
            ) {
                itemsIndexed(episodes, key = { _, item -> item.itemId }) { index, episode ->
                    val isNowPlaying = index == nowPlayingIndex
                    TvEpisodeCard(
                        episode = episode,
                        nowPlayingText = viewModel.str("nowPlaying", "Now Playing"),
                        onClick = { viewModel.selectEpisode(episode.itemId) },
                        modifier = if (isNowPlaying) Modifier.focusRequester(nowPlayingFocusRequester) else Modifier
                    )
                }
            }
        }
    }
}

@Composable
private fun TvEpisodeCard(
    episode: EpisodeListItemRecord,
    nowPlayingText: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = onClick,
        modifier = modifier.size(TvMetrics.POSTER_WIDTH, TvMetrics.POSTER_HEIGHT),
        shape = CardDefaults.shape(shape = RoundedCornerShape(TvMetrics.POSTER_CORNER)),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = androidx.compose.foundation.BorderStroke(3.dp, Color.White),
                shape = RoundedCornerShape(TvMetrics.POSTER_CORNER)
            )
        )
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.BottomStart
        ) {
            RemoteImage(
                url = episode.imageUrl,
                modifier = Modifier.fillMaxSize()
            )

            TvPosterScrim(modifier = Modifier.align(Alignment.BottomCenter))

            // Now Playing Badge (top-left)
            if (episode.isCurrent) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(10.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.White)
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.PlayArrow,
                            contentDescription = null,
                            tint = Color.Black,
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            text = nowPlayingText,
                            color = Color.Black,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Episode Title and Watch Progress (bottom)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        horizontal = TvMetrics.TEXT_INSET_H,
                        vertical = TvMetrics.TEXT_INSET_V
                    )
            ) {
                val titleText = if (episode.indexNumber != null) {
                    "${episode.indexNumber}. ${episode.title}"
                } else {
                    episode.title
                }

                Text(
                    text = titleText,
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                if (episode.progressPercent > 0) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(4.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.3f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth((episode.progressPercent / 100.0).toFloat().coerceIn(0f, 1f))
                                .height(4.dp)
                                .clip(CircleShape)
                                .background(Color.White)
                        )
                    }
                }
            }
        }
    }
}
