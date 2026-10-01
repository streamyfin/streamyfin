package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.PauseCircleOutline
import androidx.compose.material.icons.outlined.PlayCircleOutline
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

internal enum class NativeSyncPlayAction(
    val wireValue: String,
    val primary: ImageVector,
    val secondary: ImageVector? = null,
    val centered: Boolean = false,
    val spin: Boolean = false,
    val repeatsPulse: Boolean = true
) {
    SCHEDULE_PLAY("schedule-play", Icons.Filled.Sync, Icons.Filled.PlayArrow, centered = true, spin = true),
    UNPAUSE("unpause", Icons.Outlined.PlayCircleOutline, repeatsPulse = false),
    PAUSE("pause", Icons.Outlined.PauseCircleOutline, repeatsPulse = false),
    SEEK("seek", Icons.Outlined.Refresh),
    BUFFERING("buffering", Icons.Outlined.AccessTime),
    WAIT_PAUSE("wait-pause", Icons.Outlined.AccessTime, Icons.Filled.Pause),
    WAIT_UNPAUSE("wait-unpause", Icons.Outlined.AccessTime, Icons.Filled.PlayArrow);

    companion object {
        fun fromWire(value: String?): NativeSyncPlayAction? =
            entries.firstOrNull { it.wireValue == value }
    }
}

/** Decorative label only; its enclosing transport button owns click and focus. */
@Composable
fun PlayerPlaybackIcon(
    syncPlayAction: String?,
    isBuffering: Boolean,
    isPlaying: Boolean,
    size: Dp,
    color: Color = Color.White,
    syncPlayColor: Color = Color(0xFF00A4DC)
) {
    val action = NativeSyncPlayAction.fromWire(syncPlayAction)
    val scale = remember(action) { Animatable(1f) }
    val rotation = remember(action) { Animatable(0f) }

    LaunchedEffect(action) {
        if (action == null) return@LaunchedEffect
        if (action.spin) {
            launch {
                rotation.animateTo(
                    360f,
                    infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart)
                )
            }
        }
        if (action.repeatsPulse) {
            scale.animateTo(
                1.1f,
                infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse)
            )
        } else {
            scale.animateTo(1.2f, tween(220))
            scale.animateTo(1f, tween(220))
        }
    }

    Box(
        modifier = Modifier
            .size(size)
            .graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
            },
        contentAlignment = Alignment.Center
    ) {
        if (action != null) {
            Icon(
                imageVector = action.primary,
                contentDescription = null,
                tint = syncPlayColor,
                modifier = Modifier.size(size).graphicsLayer { rotationZ = rotation.value }
            )
            action.secondary?.let { secondary ->
                Icon(
                    imageVector = secondary,
                    contentDescription = null,
                    tint = syncPlayColor,
                    modifier = Modifier
                        .size(size * 0.42f)
                        .align(if (action.centered) Alignment.Center else Alignment.BottomEnd)
                )
            }
        } else if (isBuffering) {
            CircularProgressIndicator(
                color = color,
                modifier = Modifier.size(size * 0.8f),
                strokeWidth = 3.dp
            )
        } else {
            Icon(
                imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(size)
            )
        }
    }
}
