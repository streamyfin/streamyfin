import { readFileSync } from "node:fs";
import { join } from "node:path";

// Both ExoPlayer paths, the JS route's ExoPlayerView and the native chrome's
// ExoPlayerEngine, carry the same HTTP source, one copy per Gradle module, and
// so do its JVM tests. Each pair may differ by its package line only.
const modules = join(__dirname, "../..");
const read = (path: string) => readFileSync(join(modules, path), "utf8");
const withoutPackage = (path: string) =>
  read(path).replace(/^package .+$/m, "");

const exo = "exoplayer-player/android/src";
const mpv = "mpv-player/android/src";
const twins = [
  [
    `${exo}/main/java/expo/modules/exoplayerplayer/UpgradeRedirectDataSource.kt`,
    `${mpv}/main/java/expo/modules/mpvplayer/nativeplayer/engine/UpgradeRedirectDataSource.kt`,
  ],
  [
    `${exo}/test/java/expo/modules/exoplayerplayer/StreamHeaderScopeTest.kt`,
    `${mpv}/test/java/expo/modules/mpvplayer/nativeplayer/engine/StreamHeaderScopeTest.kt`,
  ],
  [
    `${exo}/test/java/expo/modules/exoplayerplayer/UpgradeRedirectDataSourceTest.kt`,
    `${mpv}/test/java/expo/modules/mpvplayer/nativeplayer/engine/UpgradeRedirectDataSourceTest.kt`,
  ],
];
const players = [
  `${exo}/main/java/expo/modules/exoplayerplayer/ExoPlayerView.kt`,
  `${mpv}/main/java/expo/modules/mpvplayer/nativeplayer/engine/ExoPlayerEngine.kt`,
];

describe("the ExoPlayer HTTP source", () => {
  it.each(twins)("%s is the same as its twin", (first, second) => {
    expect(withoutPackage(first)).toBe(withoutPackage(second));
  });

  it.each(players)("%s loads the stream through it", (path) => {
    const source = read(path);
    expect(source).toContain(
      "UpgradeRedirectDataSource.Factory(config.headers ?: emptyMap(), config.url)",
    );
    expect(source).not.toContain("DefaultHttpDataSource");
    // The player's default factory would reload the stream without its headers
    // and without following an http to https redirect.
    expect(source).not.toMatch(/\.setMediaItems?\(/);
  });
});
