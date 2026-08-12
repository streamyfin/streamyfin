/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type {
  NativePlayerSubtitleStyle,
  SubtitleStyleConfig,
} from "../../modules/mpv-player";
import type { Settings } from "../atoms/settings";

const hasCustomSubtitleStyle = (settings: Settings): boolean =>
  settings.subtitleBackground ||
  Math.abs(settings.subtitleSize - 1) > 0.001 ||
  settings.subtitleFont !== "System" ||
  settings.subtitleColor.toUpperCase() !== "#FFFFFF" ||
  settings.subtitleMarginY !== 25 ||
  settings.subtitleAlignX !== "center" ||
  settings.subtitleAlignY !== "bottom";

export interface SubtitleStyleTarget {
  setSubtitleScale?: (scale: number) => Promise<void>;
  setSubtitleMarginY?: (margin: number) => Promise<void>;
  setSubtitleAlignX?: (align: "left" | "center" | "right") => Promise<void>;
  setSubtitleAlignY?: (align: "top" | "center" | "bottom") => Promise<void>;
  setSubtitleStyle?: (style: SubtitleStyleConfig) => Promise<void>;
  setSubtitleAssOverride?: (mode: "no" | "force") => Promise<void>;
}

export const buildSubtitleStyle = (
  settings: Settings,
  options: {
    scale?: number;
    scaleLocked?: boolean;
    marginY?: number;
  } = {},
): NativePlayerSubtitleStyle => {
  const rawOpacity = Number(settings.subtitleBackgroundOpacity ?? 40);
  const opacity = Math.min(
    Math.max(Number.isFinite(rawOpacity) ? rawOpacity : 40, 0),
    100,
  );
  const alpha = Math.round((opacity / 100) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();

  return {
    scale: options.scale ?? settings.subtitleSize,
    scaleLocked: options.scaleLocked,
    marginY: options.marginY ?? settings.subtitleMarginY,
    alignX: settings.subtitleAlignX,
    alignY: settings.subtitleAlignY,
    color: settings.subtitleColor,
    font: settings.subtitleFont,
    background: settings.subtitleBackground ? `#${alpha}000000` : "",
    backgroundPadding: settings.subtitleBackgroundPadding ?? 8,
    assOverride: hasCustomSubtitleStyle(settings) ? "force" : "no",
  };
};

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
  await player.setSubtitleStyle?.({
    color: style.color,
    font: style.font,
    background: style.background,
    backgroundPadding: style.backgroundPadding,
  });
  if (style.assOverride !== undefined) {
    await player.setSubtitleAssOverride?.(style.assOverride);
  }
};
