package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroidSize
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import kotlin.math.abs

private enum class DragAxis { HORIZONTAL, VERTICAL }

@Composable
fun GesturePlane(
    viewModel: PlayerViewModel,
    modifier: Modifier = Modifier
) {
    val density = LocalDensity.current
    val verticalTravelPx = with(density) { PlayerConstants.VERTICAL_DRAG_RANGE_DP.dp.toPx() }

    var dragAxis by remember { mutableStateOf<DragAxis?>(null) }
    var dragOnLeftHalf by remember { mutableStateOf(false) }
    var dragStartFraction by remember { mutableStateOf(0.0) }
    var dragStartLevel by remember { mutableStateOf(0f) }
    var dragSuppressed by remember { mutableStateOf(false) }
    var pinchFlipped by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = {
                        viewModel.toggleControls()
                    },
                    onDoubleTap = { offset ->
                        if (viewModel.uiOptions.doubleTapToSeekEnabled && !viewModel.controlsLocked) {
                            val isRightHalf = offset.x >= (size.width / 2)
                            viewModel.doubleTapSeek(forward = isRightHalf)
                        } else {
                            viewModel.toggleControls()
                        }
                    },
                    onLongPress = {
                        if (!viewModel.controlsLocked && viewModel.uiOptions.holdToSpeedEnabled) {
                            viewModel.startHoldSpeed()
                        }
                    }
                )
            }
            .pointerInput(viewModel.isHoldSpeedActive) {
                // When hold-to-speed is engaged, release on pointer lift
                if (viewModel.isHoldSpeedActive) {
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            if (event.changes.all { !it.pressed }) {
                                viewModel.stopHoldSpeed()
                                break
                            }
                        }
                    }
                }
            }
            .pointerInput(verticalTravelPx, viewModel.controlsLocked) {
                if (viewModel.controlsLocked) return@pointerInput

                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val width = size.width.toFloat()
                    val height = size.height.toFloat()

                    dragAxis = null
                    dragOnLeftHalf = down.position.x < (width / 2)
                    dragStartFraction = if (viewModel.duration > 0) (viewModel.displayPosition / viewModel.duration) else 0.0
                    dragStartLevel = if (dragOnLeftHalf) {
                        viewModel.brightnessController?.brightness ?: 0.5f
                    } else {
                        viewModel.volumeController?.volume ?: 0.5f
                    }
                    dragSuppressed = false
                    pinchFlipped = false

                    var totalPanX = 0f
                    var totalPanY = 0f
                    var accumulatedZoom = 1f

                    do {
                        val event = awaitPointerEvent()
                        val pointers = event.changes

                        // Check for pinch zoom if 2+ pointers
                        if (pointers.size >= 2 && viewModel.uiOptions.pinchToZoomEnabled) {
                            dragSuppressed = true
                            val zoomChange = event.calculateZoom()
                            accumulatedZoom *= zoomChange

                            if (!pinchFlipped) {
                                if (accumulatedZoom > PlayerConstants.PINCH_ZOOM_IN_THRESHOLD && !viewModel.isZoomedToFill) {
                                    viewModel.toggleZoomToFill()
                                    pinchFlipped = true
                                } else if (accumulatedZoom < PlayerConstants.PINCH_ZOOM_OUT_THRESHOLD && viewModel.isZoomedToFill) {
                                    viewModel.toggleZoomToFill()
                                    pinchFlipped = true
                                }
                            }
                            pointers.forEach { it.consume() }
                            continue
                        }

                        if (dragSuppressed || viewModel.isHoldSpeedActive) {
                            pointers.forEach { it.consume() }
                            continue
                        }

                        val pan = event.calculatePan()
                        totalPanX += pan.x
                        totalPanY += pan.y

                        // Determine drag axis lock on first significant movement (> 10px)
                        if (dragAxis == null) {
                            if (abs(totalPanX) > 15f || abs(totalPanY) > 15f) {
                                dragAxis = if (abs(totalPanX) > abs(totalPanY)) {
                                    DragAxis.HORIZONTAL
                                } else {
                                    DragAxis.VERTICAL
                                }
                                if (dragAxis == DragAxis.HORIZONTAL) {
                                    viewModel.startScrubbing()
                                } else {
                                    if (dragOnLeftHalf) {
                                        viewModel.brightnessController?.isUserInteracting = true
                                        viewModel.revealBrightnessSliderTransiently()
                                    } else {
                                        viewModel.volumeController?.isUserInteracting = true
                                        viewModel.revealVolumeSliderTransiently()
                                    }
                                }
                            }
                        }

                        // Apply locked drag
                        when (dragAxis) {
                            DragAxis.HORIZONTAL -> {
                                val deltaFraction = (totalPanX / width) * 0.8f
                                val newPos = ((dragStartFraction + deltaFraction).coerceIn(0.0, 1.0)) * viewModel.duration
                                viewModel.updateScrub(newPos)
                                pointers.forEach { it.consume() }
                            }
                            DragAxis.VERTICAL -> {
                                val deltaFraction = -(totalPanY / verticalTravelPx)
                                val newLevel = (dragStartLevel + deltaFraction).coerceIn(0.0f, 1.0f)
                                if (dragOnLeftHalf) {
                                    viewModel.brightnessController?.setBrightness(newLevel)
                                    viewModel.revealBrightnessSliderTransiently()
                                } else {
                                    viewModel.volumeController?.setVolume(newLevel)
                                    viewModel.revealVolumeSliderTransiently()
                                }
                                pointers.forEach { it.consume() }
                            }
                            null -> {}
                        }

                    } while (event.changes.any { it.pressed })

                    // Gesture ended
                    if (dragAxis == DragAxis.HORIZONTAL) {
                        viewModel.finishScrubbing(viewModel.scrubPosition)
                    } else if (dragAxis == DragAxis.VERTICAL) {
                        viewModel.brightnessController?.isUserInteracting = false
                        viewModel.volumeController?.isUserInteracting = false
                    }
                    if (viewModel.isHoldSpeedActive) {
                        viewModel.stopHoldSpeed()
                    }
                }
            }
    )
}
