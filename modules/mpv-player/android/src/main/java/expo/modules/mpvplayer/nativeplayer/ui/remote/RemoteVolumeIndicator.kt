package expo.modules.mpvplayer.nativeplayer.ui.remote

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import expo.modules.mpvplayer.nativeplayer.remote.VolumeIndicator

private val Pill = RoundedCornerShape(50)

/**
 * The TV's level for a moment after it changes (VolumeIndicatorModel): the Cast icon, then a bar, dimmed and
 * crossed by a muted icon when the TV is muted. Decorative for TalkBack, which already hears the system's own panel
 * when the keys move the level.
 */
@Composable
internal fun RemoteVolumeIndicator(indicator: VolumeIndicator?, modifier: Modifier = Modifier) {
    // The last one shown stays drawn while it fades out; a plain holder, written without a recomposition.
    val last = remember { arrayOfNulls<VolumeIndicator>(1) }
    if (indicator != null) last[0] = indicator
    AnimatedVisibility(
        visible = indicator != null,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier.padding(top = 8.dp),
    ) {
        val shown = indicator ?: last[0] ?: return@AnimatedVisibility
        Row(
            modifier = Modifier
                .clip(Pill)
                .background(Color.Black.copy(alpha = 0.6f))
                .padding(horizontal = 14.dp, vertical = 10.dp)
                .clearAndSetSemantics {},
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.Cast, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            Box(
                modifier = Modifier
                    .padding(horizontal = 10.dp)
                    .width(140.dp)
                    .height(4.dp)
                    .alpha(if (shown.muted) 0.4f else 1f)
                    .clip(Pill)
                    .background(Color.White.copy(alpha = 0.3f)),
            ) {
                Box(
                    Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(shown.level.coerceIn(0.0, 1.0).toFloat())
                        .background(Color.White),
                )
            }
            if (shown.muted) {
                Icon(Icons.AutoMirrored.Filled.VolumeOff, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
        }
    }
}
