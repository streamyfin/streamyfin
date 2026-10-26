import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The TV settings screen shows a setting the server locked as locked only when its
 * control gets disabledByAdmin. Without it the control looks free, and pressing it
 * does nothing, since updateSettings drops a locked key.
 */
const SCREEN = path.join(
  __dirname,
  "../../../app/(auth)/(tabs)/(home)/settings.tv.tsx",
);

/**
 * Settings the plugin can lock whose control on this screen shows no lock yet. They
 * predate this test, so the list may shrink but never grow.
 */
const WITHOUT_LOCK = [
  "inactivityTimeout",
  "mergeNextUpAndContinueWatching",
  "mpvCacheEnabled",
  "mpvCacheSeconds",
  "mpvDemuxerMaxBackBytes",
  "mpvDemuxerMaxBytes",
  "mpvVoDriver",
  "openSubtitlesApiKey",
  "openSubtitlesEnabled",
  "preferedLanguage",
  "showHomeBackdrop",
  "showSeriesPosterOnEpisode",
  "showUpcomingOnHome",
  "subtitlesOnMute",
  "subtitlesOnMuteAllowRestart",
  "syncPlayIgnoreWait",
  "tvThemeMusicEnabled",
  "tvTypographyScale",
  "useEpisodeImagesForNextUp",
  "wikidataAwardsEnabled",
];

interface Control {
  keys: string[];
  lock?: string;
}

/** Each TV settings control on the screen, with the settings it writes and its lock. */
const controls = (source: string): Control[] =>
  [...source.matchAll(/<TVSettings\w+\b/g)].map((match) => {
    const start = match.index ?? 0;
    // The opening tag ends at the first ">" outside the braces of its props.
    let end = start;
    let depth = 0;
    while (end < source.length) {
      const char = source[end];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (char === ">" && depth === 0) break;
      end++;
    }
    const tag = source.slice(start, end);
    return {
      // The audio and subtitle choices write through updateMediaSettings.
      keys: [
        ...tag.matchAll(
          /\b(?:updateSettings|updateMediaSettings)\(\{\s*(\w+)/g,
        ),
      ].map((write) => write[1]),
      lock: tag.match(/disabledByAdmin=\{([^}]*)\}/)?.[1],
    };
  });

describe("the TV settings screen", () => {
  const writing = controls(readFileSync(SCREEN, "utf8")).filter(
    (control) => control.keys.length > 0,
  );

  it("finds the controls that write a setting", () => {
    expect(writing.length).toBeGreaterThan(WITHOUT_LOCK.length);
  });

  it("shows the lock of every setting it writes, apart from the known ones", () => {
    const unlocked = writing
      .flatMap((control) =>
        control.keys.filter(
          (key) => !control.lock?.includes(`pluginSettings?.${key}?.locked`),
        ),
      )
      .filter((key) => !WITHOUT_LOCK.includes(key));

    expect(unlocked).toEqual([]);
  });

  it("keeps no known one that shows its lock by now", () => {
    const stillUnlocked = new Set(
      writing
        .filter((control) => control.lock === undefined)
        .flatMap((control) => control.keys),
    );

    expect(WITHOUT_LOCK.filter((key) => !stillUnlocked.has(key))).toEqual([]);
  });
});
