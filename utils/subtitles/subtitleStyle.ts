/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { NativePlayerSubtitleStyle } from "../../modules/mpv-player/src/NativePlayerPresentation.types";
import type { Settings } from "../atoms/settings";

export interface SubtitleStyleTarget {
  setSubtitleScale?: (scale: number) => Promise<void>;
  setSubtitleMarginY?: (margin: number) => Promise<void>;
  setSubtitleAlignX?: (align: "left" | "center" | "right") => Promise<void>;
  setSubtitleAlignY?: (align: "top" | "center" | "bottom") => Promise<void>;
  setSubtitleBorderStyle?: (
    style: "outline-and-shadow" | "background-box",
  ) => Promise<void>;
  setSubtitleBackgroundColor?: (color: string) => Promise<void>;
  setSubtitleAssOverride?: (mode: "no" | "force") => Promise<void>;
}

/**
 * Builds a NativePlayerSubtitleStyle record from current user settings.
 */
export const buildSubtitleStyle = (
  settings: Settings,
): NativePlayerSubtitleStyle => {
  const style: NativePlayerSubtitleStyle = {
    scale: settings.mpvSubtitleScale,
    marginY: settings.mpvSubtitleMarginY,
    alignX: settings.mpvSubtitleAlignX,
    alignY: settings.mpvSubtitleAlignY,
  };
  if (settings.mpvSubtitleBackgroundEnabled) {
    const opacity = settings.mpvSubtitleBackgroundOpacity ?? 75;
    const alphaHex = Math.round((opacity / 100) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    style.borderStyle = "background-box";
    style.backgroundColor = `#000000${alphaHex}`;
    style.assOverride = "force";
  } else {
    style.borderStyle = "outline-and-shadow";
    style.backgroundColor = "#00000000";
    style.assOverride = "no";
  }
  return style;
};

/**
 * Applies a NativePlayerSubtitleStyle object imperatively to a player instance.
 */
export const applySubtitleStyle = async (
  player: SubtitleStyleTarget | null | undefined,
  style: NativePlayerSubtitleStyle,
): Promise<void> => {
  if (!player) return;

  if (style.scale !== undefined) {
    await player.setSubtitleScale?.(style.scale);
  }
  if (style.marginY !== undefined) {
    await player.setSubtitleMarginY?.(style.marginY);
  }
  if (style.alignX !== undefined) {
    await player.setSubtitleAlignX?.(style.alignX);
  }
  if (style.alignY !== undefined) {
    await player.setSubtitleAlignY?.(style.alignY);
  }
  if (style.borderStyle !== undefined) {
    await player.setSubtitleBorderStyle?.(style.borderStyle);
  }
  if (style.backgroundColor !== undefined) {
    await player.setSubtitleBackgroundColor?.(style.backgroundColor);
  }
  if (style.assOverride !== undefined) {
    await player.setSubtitleAssOverride?.(style.assOverride);
  }
};
