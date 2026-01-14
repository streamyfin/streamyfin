/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Image-based formats - these need to be burned in by Jellyfin (Encode method)
// because MPV cannot load them externally over HTTP
const IMAGE_BASED_FORMATS = [
  "dvdsub",
  "idx",
  "pgs",
  "pgssub",
  "teletext",
  "vobsub",
];

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
  "xsub",
];

export const getSubtitleProfiles = () => {
  const profiles = [];

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

// Export for use in player filtering
export const IMAGE_SUBTITLE_CODECS = IMAGE_BASED_FORMATS;
