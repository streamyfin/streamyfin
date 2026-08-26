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

  it("delivers text subtitles externally and burns image ones in for target download", () => {
    const profiles = getSubtitleProfiles({ target: "download" });
    expect(profiles.length).toBe(26);

    // Text formats come down as sidecar files the offline player can switch.
    expect(profiles).toContainEqual({ Format: "srt", Method: "External" });
    expect(profiles).toContainEqual({ Format: "ass", Method: "External" });
    // Image formats have no external path, so the server burns them in.
    expect(profiles).toContainEqual({ Format: "pgs", Method: "Encode" });
    expect(profiles).toContainEqual({ Format: "vobsub", Method: "Encode" });
    expect(profiles).toContainEqual({ Format: "xsub", Method: "Encode" });
    expect(profiles.filter((p) => p.Method === "Encode").length).toBe(7);
  });

  it("returns 1 entry for target chromecast (external vtt)", () => {
    const profiles = getSubtitleProfiles({ target: "chromecast" });
    expect(profiles).toEqual([{ Format: "vtt", Method: "External" }]);
  });

  it("returns empty array for target music", () => {
    const profiles = getSubtitleProfiles({ target: "music" });
    expect(profiles).toEqual([]);
  });
});
