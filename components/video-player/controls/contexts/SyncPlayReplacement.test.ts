import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const direct = readFileSync(
  join(__dirname, "../../../../app/(auth)/player/direct-player.tsx"),
  "utf8",
);
const context = readFileSync(join(__dirname, "VideoContext.tsx"), "utf8");

describe("SyncPlay source replacement", () => {
  test("each direct-player track replacement preserves group startup semantics", () => {
    const audio = direct
      .split("if (isTranscoding) {", 2)[1]
      ?.split("// Convert Jellyfin index", 1)[0];
    const selection = direct
      .split("const replaceWithTrackSelection", 2)[1]
      ?.split("// TV quality", 1)[0];
    for (const source of [audio, selection]) {
      expect(source).toContain('openedViaSyncPlay && { syncPlay: "true" }');
    }
    expect(context).toContain('syncPlay === "true" && { syncPlay: "true" }');
  });

  test("readiness belongs to the loaded item/URL rather than a sticky boolean", () => {
    expect(direct).toContain("loadedSourceKey === sourceKey");
    expect(direct).toContain("item?.Id === itemId");
    expect(direct).toContain("event.nativeEvent.url !== stream?.url");
    expect(direct).not.toContain("setIsVideoLoaded(true)");
    expect(direct).toContain("setLoadedSourceKey(null)");
    expect(direct).toMatch(
      /onPipToggleRequest=\{\(\) => \{[\s\S]*?syncPlayController\?\.playPause\(\)/,
    );
  });
});
