package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp

/**
 * The mark of a live stream, where a film has its bar and its times. Shared
 * by the phone and TV chromes, so it takes its text style from neither theme.
 */
@Composable
fun LiveBadge(
    text: String,
    fontSize: TextUnit,
    padding: PaddingValues,
    modifier: Modifier = Modifier
) {
    BasicText(
        text = text,
        style = TextStyle(
            color = Color.White,
            fontSize = fontSize,
            fontWeight = FontWeight.Bold
        ),
        maxLines = 1,
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(PlayerLiveBadgeColor)
            .padding(padding)
    )
}
