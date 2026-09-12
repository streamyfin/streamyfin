import { describe, expect, it } from "bun:test";
import { getSubtitleProfiles } from "./subtitles";

describe("getSubtitleProfiles", () => {
  it("returns 51 entries for target mpv (default)", () => {
    const profiles = getSubtitleProfiles({ target: "mpv" });
    expect(profiles.length).toBe(51);

    // Verify default call without args matches mpv
    expect(getSubtitleProfiles()).toEqual(profiles);

    // Check image sub sample
    expect(profiles).toContainEqual({ Format: "pgs", Method: "Embed" });
    expect(profiles).toContainEqual({ Format: "pgs", Method: "Encode" });

    // Check text sub sample
    expect(profiles).toContainEqual({ Format: "srt", Method: "Embed" });
    expect(profiles).toContainEqual({ Format: "srt", Method: "External" });
  });

  // A .vtt sidecar probes as codec "webvtt"; offering that name for External
  // delivery makes the server rewrite the file and drop every cue (#1892).
  it.each(["mpv", "download"] as const)(
    "never offers webvtt as an External format for target %s",
    (target) => {
      const profiles = getSubtitleProfiles({ target });

      expect(profiles).not.toContainEqual({
        Format: "webvtt",
        Method: "External",
      });
      // With no exact codec match the server takes the first External profile,
      // so "vtt" must lead or the sidecar gets converted instead of passed on.
      expect(profiles.find((p) => p.Method === "External")).toEqual({
        Format: "vtt",
        Method: "External",
      });
    },
  );

  // Embed matches a container codec and converts nothing, so the alias is safe.
  it("still matches an embedded webvtt track in the container", () => {
    expect(getSubtitleProfiles({ target: "mpv" })).toContainEqual({
      Format: "webvtt",
      Method: "Embed",
    });
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
    expect(profiles.length).toBe(25);

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
