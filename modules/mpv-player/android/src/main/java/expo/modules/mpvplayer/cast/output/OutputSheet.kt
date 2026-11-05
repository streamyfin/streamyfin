package expo.modules.mpvplayer.cast.output

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.SettingsRemote
import androidx.compose.material.icons.filled.Speaker
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.TabletAndroid
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import expo.modules.mpvplayer.cast.target.RemoteTargetConstants
import expo.modules.mpvplayer.nativeplayer.ui.PlayerAccentColor
import kotlin.math.roundToInt

// The output sheet's drawing: it follows the controller's state and hands every tap back to it.

private val SheetColor = Color(0xFF1C1C1E)
private val RowColor = Color.White.copy(alpha = 0.05f)
private val CaptionColor = Color.White.copy(alpha = 0.6f)
private val FailureColor = Color(0xFFFF6961)

/** A full width sheet on a compact window, a popover by the button from 600 dp. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OutputSheetHost(
    controller: OutputSheetController,
    strings: OutputPickerStrings,
    anchor: IntRect?,
    onDismiss: () -> Unit,
) {
    var state by remember { mutableStateOf(controller.state) }
    DisposableEffect(controller) {
        controller.onState = { state = it }
        onDispose { controller.onState = null }
    }
    val widthDp = LocalConfiguration.current.screenWidthDp
    val density = LocalDensity.current.density
    LaunchedEffect(widthDp) { controller.setWidth(widthDp) }

    when (outputLayout(widthDp)) {
        OutputLayout.SHEET ->
            ModalBottomSheet(
                onDismissRequest = onDismiss,
                sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
                containerColor = SheetColor,
                contentColor = Color.White,
            ) {
                OutputSheetContent(state, strings, controller, Modifier.navigationBarsPadding())
            }
        OutputLayout.POPOVER ->
            Popup(
                popupPositionProvider = remember(anchor, density) { AnchorPosition(anchor, density) },
                onDismissRequest = onDismiss,
                properties = PopupProperties(focusable = true, dismissOnBackPress = true, dismissOnClickOutside = true),
            ) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = SheetColor,
                    contentColor = Color.White,
                    shadowElevation = 12.dp,
                    modifier = Modifier.widthIn(max = RemoteTargetConstants.POPOVER_MAX_WIDTH_DP.dp),
                ) {
                    OutputSheetContent(state, strings, controller, Modifier.padding(vertical = 8.dp))
                }
            }
    }
}

/** Below the button, its right edges aligned, kept inside the window; centred with no button to point at. */
internal class AnchorPosition(private val anchor: IntRect?, private val density: Float) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val margin = (RemoteTargetConstants.POPOVER_MARGIN_DP * density).roundToInt()
        val button = anchor
            ?: return IntOffset((windowSize.width - popupContentSize.width) / 2, (windowSize.height - popupContentSize.height) / 2)
        val maxX = (windowSize.width - popupContentSize.width - margin).coerceAtLeast(margin)
        val x = (button.right - popupContentSize.width).coerceIn(margin, maxX)
        val below = button.bottom + margin / 2
        val y =
            if (below + popupContentSize.height <= windowSize.height - margin) below
            else (button.top - margin / 2 - popupContentSize.height).coerceAtLeast(margin)
        return IntOffset(x, y)
    }
}

@Composable
private fun OutputSheetContent(
    state: OutputSheetState,
    strings: OutputPickerStrings,
    controller: OutputSheetController,
    modifier: Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(max = 640.dp)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        when (state) {
            is OutputSheetState.List -> OutputList(state.rows, strings, controller)
            is OutputSheetState.Connected -> ConnectedPanelContent(state, strings, controller)
        }
        Spacer(Modifier.size(8.dp))
    }
}

@Composable
private fun OutputList(rows: List<OutputRow>, strings: OutputPickerStrings, controller: OutputSheetController) {
    Text(
        text = strings.get("title"),
        fontSize = 18.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(bottom = 6.dp),
    )
    rows.forEach { row ->
        when (row) {
            is OutputRow.ThisDevice ->
                SheetRow(
                    icon = if (row.kind == ThisDeviceKind.TABLET) Icons.Filled.TabletAndroid else Icons.Filled.PhoneAndroid,
                    title = strings.get(if (row.kind == ThisDeviceKind.TABLET) "thisTablet" else "thisPhone"),
                    caption = row.playing?.let { strings.get("playing") },
                    onClick = { controller.tap(row) },
                )
            is OutputRow.Device -> DeviceRow(row, strings, controller)
            is OutputRow.AirPlay ->
                SheetRow(
                    icon = Icons.Filled.Tv,
                    title = strings.get("airPlay"),
                    caption = row.activeRoute ?: strings.get("airPlayCaption"),
                    onClick = { controller.tap(row) },
                )
            is OutputRow.Status -> StatusRow(row, strings, controller)
        }
    }
}

@Composable
private fun DeviceRow(row: OutputRow.Device, strings: OutputPickerStrings, controller: OutputSheetController) {
    val status = row.status
    SheetRow(
        icon = if (row.videoOut) Icons.Filled.Tv else Icons.Filled.Speaker,
        title = row.name,
        caption = when (status) {
            DeviceStatus.Idle -> strings.get("castCaption")
            DeviceStatus.Connecting -> strings.get("connecting")
            DeviceStatus.Connected -> strings.get("connected")
            is DeviceStatus.Failed -> strings.cause(status.cause)
        },
        captionColor = if (status is DeviceStatus.Failed) FailureColor else CaptionColor,
        selected = status == DeviceStatus.Connected,
        onClick = { controller.tap(row) },
        trailing = {
            when (status) {
                DeviceStatus.Connecting -> {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                    TextButton(onClick = { controller.cancel() }) { Text(strings.get("cancel"), color = PlayerAccentColor) }
                }
                DeviceStatus.Connected -> Icon(Icons.Filled.Check, contentDescription = null, tint = PlayerAccentColor)
                else -> Unit
            }
        },
    )
}

@Composable
private fun StatusRow(row: OutputRow.Status, strings: OutputPickerStrings, controller: OutputSheetController) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (row.status == SheetStatus.SEARCHING) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = CaptionColor)
        }
        Text(
            text = strings.get(
                when (row.status) {
                    SheetStatus.SEARCHING -> "searching"
                    SheetStatus.NO_DEVICES -> "noDevices"
                    SheetStatus.PLAY_SERVICES_MISSING -> "playServicesMissing"
                    SheetStatus.PLAY_SERVICES_UPDATE -> "playServicesUpdate"
                },
            ),
            color = CaptionColor,
            fontSize = 14.sp,
            modifier = Modifier.weight(1f),
        )
        if (row.status == SheetStatus.PLAY_SERVICES_MISSING || row.status == SheetStatus.PLAY_SERVICES_UPDATE) {
            TextButton(onClick = { controller.tap(row) }) { Text(strings.get("playServicesAction"), color = PlayerAccentColor) }
        }
    }
}

@Composable
private fun ConnectedPanelContent(
    panel: OutputSheetState.Connected,
    strings: OutputPickerStrings,
    controller: OutputSheetController,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Icon(
            if (panel.videoOut) Icons.Filled.Tv else Icons.Filled.Speaker,
            contentDescription = null,
            tint = PlayerAccentColor,
            modifier = Modifier.size(28.dp),
        )
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(panel.target.name, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                strings.get(if (panel.reconnecting) "reconnecting" else "connected"),
                color = CaptionColor,
                fontSize = 13.sp,
            )
        }
        TextButton(onClick = { controller.change() }) { Text(strings.get("change"), color = PlayerAccentColor) }
    }
    if (panel.canSetVolume) VolumeRow(panel, strings, controller)
    if (panel.canStop) {
        SheetRow(
            icon = Icons.Filled.SettingsRemote,
            title = strings.get("remote"),
            caption = panel.receiverTitle,
            onClick = { controller.remote() },
        )
    }
    SheetRow(
        icon = if (panel.canStop) Icons.Filled.Stop else Icons.Filled.Close,
        title = strings.get(if (panel.canStop) "stopPlayback" else "disconnect"),
        caption = null,
        onClick = { controller.stop() },
    )
}

@Composable
private fun VolumeRow(panel: OutputSheetState.Connected, strings: OutputPickerStrings, controller: OutputSheetController) {
    var dragged by remember { mutableStateOf<Float?>(null) }
    val level = (panel.volume ?: 0.0).toFloat()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(RowColor)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The button's own content color, so a disabled one dims.
        IconButton(onClick = { controller.toggleMute() }, enabled = panel.canMute) {
            Icon(
                if (panel.muted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp,
                contentDescription = strings.get(if (panel.muted) "unmute" else "mute"),
            )
        }
        val volumeLabel = strings.get("volume")
        Slider(
            value = level,
            onValueChange = {
                dragged = it
                controller.dragVolume(it.toDouble())
            },
            onValueChangeFinished = {
                dragged?.let { controller.releaseVolume(it.toDouble()) }
                dragged = null
            },
            colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = PlayerAccentColor),
            modifier = Modifier
                .weight(1f)
                .semantics { contentDescription = volumeLabel },
        )
        Text(
            text = (level * 100).roundToInt().toString(),
            fontSize = 14.sp,
            modifier = Modifier
                // Wide enough for "100" at the default size, so the slider holds still while it moves; a large font widens it.
                .widthIn(min = 40.dp)
                .padding(start = 8.dp),
        )
    }
}

@Composable
private fun SheetRow(
    icon: ImageVector,
    title: String,
    caption: String?,
    onClick: () -> Unit,
    captionColor: Color = CaptionColor,
    selected: Boolean = false,
    trailing: @Composable () -> Unit = {},
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) Color.White.copy(alpha = 0.12f) else RowColor)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = Color.White)
        }
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            // A failure says why in full, however large the text: the row grows instead.
            caption?.let { Text(it, color = captionColor, fontSize = 13.sp) }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { trailing() }
    }
}
