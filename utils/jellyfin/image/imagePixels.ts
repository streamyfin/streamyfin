import { PixelRatio } from "react-native";
import { MAX_IMAGE_SIDE_PX } from "@/constants/Images";

/**
 * Physical pixels a layout length covers on this screen.
 *
 * Layout is measured in density independent points and the server sizes
 * images in pixels. Every size sent to the server goes through here, or a 3x
 * screen stretches the image over three times the pixels it was asked for.
 */
export const toImagePixels = (layoutSize: number) =>
  PixelRatio.getPixelSizeForLayoutSize(layoutSize);

/**
 * Turns a `fillWidth` request into "cover this box" by adding the box height.
 *
 * With both sides the server returns the smallest image that still fills the
 * box, whichever side binds. A wide backdrop in a tall header is bound by its
 * height, so asking by width alone returns too few rows and the image is
 * scaled up to cover. The two maximums then bound what that can cost: the
 * server applies them first and never scales back up to reach the box.
 */
export const fillHeightParams = (height: number) => ({
  fillHeight: String(Math.round(height)),
  maxWidth: String(MAX_IMAGE_SIDE_PX),
  maxHeight: String(MAX_IMAGE_SIDE_PX),
});
