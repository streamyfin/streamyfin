/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { SubtitleProfile } from "@jellyfin/sdk/lib/generated-client/models";

export type SubtitleProfileTarget =
  | "mpv"
  | "exoplayer"
  | "download"
  | "chromecast"
  | "music";

// Image-based formats - these need to be burned in by Jellyfin (Encode method)
// because MPV cannot load them externally over HTTP
const IMAGE_BASED_FORMATS = [
  "dvdsub",
  "idx",
  "pgs",
  "pgssub",
  "teletext",
  "vobsub",
  "xsub",
] as const;

// Text-based formats - these can be loaded externally by MPV
const TEXT_BASED_FORMATS = [
  "webvtt",
  "vtt",
  "srt",
  "subrip",
  "ttml",
  "ass",
  "ssa",
  "microdvd",
  "mov_text",
  "mpl2",
  "pjs",
  "realtext",
  "scc",
  "smi",
  "stl",
  "sub",
  "subviewer",
  "text",
  "vplayer",
] as const;

const EXOPLAYER_SUBTITLE_PROFILES: SubtitleProfile[] = [
  { Format: "srt", Method: "External" },
  { Format: "vtt", Method: "External" },
  { Format: "ttml", Method: "External" },
  { Format: "pgssub", Method: "Encode" },
];

// Text subs are delivered as sidecar VTT files the receiver fetches and
// renders itself. Burning them in (Encode) forces a full video re-encode,
// which some receivers refuse to play — image subs (no External profile)
// still fall back to server-side burn-in.
const CHROMECAST_SUBTITLE_PROFILES: SubtitleProfile[] = [
  { Format: "vtt", Method: "External" },
];

// Downloads take text subtitles as sidecar files, which the offline player
// sub-adds and can switch between; image formats have no external path and
// still get burned in ("Encode") by the server.
const DOWNLOAD_SUBTITLE_PROFILES: SubtitleProfile[] = [
  ...TEXT_BASED_FORMATS.map(
    (Format): SubtitleProfile => ({ Format, Method: "External" }),
  ),
  ...IMAGE_BASED_FORMATS.map(
    (Format): SubtitleProfile => ({ Format, Method: "Encode" }),
  ),
];

const buildMpvSubtitleProfiles = (): SubtitleProfile[] => {
  const profiles: SubtitleProfile[] = [];
  // Image-based formats: Embed or Encode (burn-in), NOT External
  for (const format of IMAGE_BASED_FORMATS) {
    profiles.push({ Format: format, Method: "Embed" });
    profiles.push({ Format: format, Method: "Encode" });
  }
  // Text-based formats: Embed or External
  for (const format of TEXT_BASED_FORMATS) {
    profiles.push({ Format: format, Method: "Embed" });
    profiles.push({ Format: format, Method: "External" });
  }
  return profiles;
};

export const getSubtitleProfiles = (options?: {
  target?: SubtitleProfileTarget;
}): SubtitleProfile[] => {
  const target = options?.target ?? "mpv";

  switch (target) {
    case "exoplayer":
      return [...EXOPLAYER_SUBTITLE_PROFILES];
    case "download":
      return [...DOWNLOAD_SUBTITLE_PROFILES];
    case "chromecast":
      return [...CHROMECAST_SUBTITLE_PROFILES];
    case "music":
      return [];
    default:
      return buildMpvSubtitleProfiles();
  }
};

// Export for use in player filtering
export const IMAGE_SUBTITLE_CODECS: readonly string[] = IMAGE_BASED_FORMATS;
export const TEXT_SUBTITLE_CODECS: readonly string[] = TEXT_BASED_FORMATS;
