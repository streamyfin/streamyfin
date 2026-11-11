import { readFileSync } from "node:fs";
import { join } from "node:path";

// UpgradeRedirectDataSource scopes the stream's headers to its own host and
// follows an http to https redirect. Its JVM tests cover the source itself;
// this covers the engine still loading every stream through it.
const engine = readFileSync(
  join(
    __dirname,
    "../android/src/main/java/expo/modules/mpvplayer/nativeplayer/engine/ExoPlayerEngine.kt",
  ),
  "utf8",
);

describe("the ExoPlayer HTTP source", () => {
  it("is what the engine loads the stream through", () => {
    expect(engine).toContain(
      "UpgradeRedirectDataSource.Factory(config.headers ?: emptyMap(), config.url)",
    );
    expect(engine).not.toContain("DefaultHttpDataSource");
    // The player's default factory would reload the stream without its headers
    // and without following an http to https redirect.
    expect(engine).not.toMatch(/\.setMediaItems?\(/);
  });
});
