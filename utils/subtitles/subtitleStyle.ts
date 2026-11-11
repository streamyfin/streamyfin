/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { NativePlayerSubtitleStyle } from "../../modules/mpv-player";
import type { Settings } from "../atoms/settings";

const normalizedColor = (color?: string) => (color ?? "#FFFFFF").toUpperCase();

export const hasCustomSubtitleStyle = (settings: Settings): boolean =>
  (settings.subtitleBackground ?? false) ||
  Math.abs((settings.subtitleSize ?? 1) - 1) > 0.001 ||
  (settings.subtitleFont ?? "System") !== "System" ||
  normalizedColor(settings.subtitleColor) !== "#FFFFFF" ||
  (settings.subtitleMarginY ?? 25) !== 25 ||
  (settings.subtitleAlignX ?? "center") !== "center" ||
  (settings.subtitleAlignY ?? "bottom") !== "bottom";

export const buildSubtitleStyle = (
  settings: Settings,
  options: {
    scale?: number;
    scaleLocked?: boolean;
    marginY?: number;
  } = {},
): NativePlayerSubtitleStyle => {
  const rawOpacity = Number(settings.subtitleBackgroundOpacity ?? 60);
  const opacity = Math.min(
    Math.max(Number.isFinite(rawOpacity) ? rawOpacity : 60, 0),
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
