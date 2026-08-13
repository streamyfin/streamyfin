package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val PlayerDarkScrim = Color(0x99000000)
val PlayerPillBackground = Color(0x8C000000)
// Streamyfin primary purple — keep in sync with constants/Colors.ts `primary`.
val PlayerAccentColor = Color(0xFF9334E9)
val PlayerTrackBackground = Color(0x40FFFFFF)
val PlayerBufferTrack = Color(0x66FFFFFF)
val PlayerProgressTrack = Color(0xFFFFFFFF)

private val DarkColorScheme = darkColorScheme(
    primary = Color.White,
    secondary = PlayerAccentColor,
    background = Color.Black,
    surface = Color(0xFF181818),
    onPrimary = Color.Black,
    onSecondary = Color.White,
    onBackground = Color.White,
    onSurface = Color.White,
)

@Composable
fun PlayerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
