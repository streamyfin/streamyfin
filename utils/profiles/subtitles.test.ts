import { describe, expect, it } from "bun:test";
import { getSubtitleProfiles } from "./subtitles";

describe("getSubtitleProfiles", () => {
  it("returns 52 entries for target mpv (default)", () => {
    const profiles = getSubtitleProfiles({ target: "mpv" });
    expect(profiles.length).toBe(52);

    // Verify default call without args matches mpv
    expect(getSubtitleProfiles()).toEqual(profiles);

    // Check image sub sample
    expect(profiles).toContainEqual({ Format: "pgs", Method: "Embed" });
    expect(profiles).toContainEqual({ Format: "pgs", Method: "Encode" });

    // Check text sub sample
    expect(profiles).toContainEqual({ Format: "srt", Method: "Embed" });
    expect(profiles).toContainEqual({ Format: "srt", Method: "External" });
  });

  it("returns 4 entries for target exoplayer", () => {
    const profiles = getSubtitleProfiles({ target: "exoplayer" });
    expect(profiles).toEqual([
      { Format: "srt", Method: "External" },
      { Format: "vtt", Method: "External" },
      { Format: "ttml", Method: "External" },
      { Format: "pgssub", Method: "Encode" },
    ]);
  });

  it("returns 25 entries for target download (all Encode)", () => {
    const profiles = getSubtitleProfiles({ target: "download" });
    expect(profiles.length).toBe(25);
    expect(profiles.every((p) => p.Method === "Encode")).toBe(true);
    expect(profiles[0]).toEqual({ Format: "vtt", Method: "Encode" });
  });

  it("returns 1 entry for target chromecast (deduplicated vtt)", () => {
    const profiles = getSubtitleProfiles({ target: "chromecast" });
    expect(profiles).toEqual([{ Format: "vtt", Method: "Encode" }]);
  });

  it("returns empty array for target music", () => {
    const profiles = getSubtitleProfiles({ target: "music" });
    expect(profiles).toEqual([]);
  });
});
