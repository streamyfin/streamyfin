import {
  gainDbToVolume,
  getNormalizationVolume,
  resolveNormalizationGainDb,
  toTrackNormalizationGains,
} from "@/utils/music/normalization";

describe("gainDbToVolume", () => {
  test("turns dB into a linear factor", () => {
    expect(gainDbToVolume(-6)).toBeCloseTo(0.5012, 4);
    expect(gainDbToVolume(-20)).toBeCloseTo(0.1, 10);
    expect(gainDbToVolume(-40)).toBeCloseTo(0.01, 10);
  });

  test("leaves a 0 dB track at full volume", () => {
    expect(gainDbToVolume(0)).toBe(1);
  });

  test("never amplifies a track the server wants louder", () => {
    expect(gainDbToVolume(0.5)).toBe(1);
    expect(gainDbToVolume(12)).toBe(1);
  });
});

describe("resolveNormalizationGainDb", () => {
  const both = { normalizationGain: -7.5, albumNormalizationGain: -5 };

  test("applies nothing when normalization is off", () => {
    expect(resolveNormalizationGainDb(both, "off")).toBeNull();
  });

  test("uses the track gain in track mode, even when an album gain exists", () => {
    expect(resolveNormalizationGainDb(both, "track")).toBe(-7.5);
  });

  test("prefers the album gain in album mode", () => {
    expect(resolveNormalizationGainDb(both, "album")).toBe(-5);
  });

  test("falls back to the track gain when the album has none", () => {
    expect(
      resolveNormalizationGainDb({ normalizationGain: -7.5 }, "album"),
    ).toBe(-7.5);
  });

  test("does not fall back from track mode to the album gain", () => {
    expect(
      resolveNormalizationGainDb({ albumNormalizationGain: -5 }, "track"),
    ).toBeNull();
  });

  test("applies nothing to a track the server has not scanned yet", () => {
    expect(resolveNormalizationGainDb({}, "track")).toBeNull();
    expect(resolveNormalizationGainDb({}, "album")).toBeNull();
    expect(resolveNormalizationGainDb(undefined, "album")).toBeNull();
  });

  // The mode is a stored string, and the plugin can push one too.
  test("applies nothing for a mode it does not know", () => {
    expect(
      resolveNormalizationGainDb(both, "Album" as unknown as "album"),
    ).toBeNull();
  });

  // 0 is falsy: an `||` fallback would skip a real 0 dB album gain.
  test("keeps a 0 dB album gain instead of falling through to the track", () => {
    expect(
      resolveNormalizationGainDb(
        { normalizationGain: -7.5, albumNormalizationGain: 0 },
        "album",
      ),
    ).toBe(0);
  });
});

describe("getNormalizationVolume", () => {
  test("plays at full volume when off or when the track has no gain", () => {
    expect(getNormalizationVolume({ normalizationGain: -6 }, "off")).toBe(1);
    expect(getNormalizationVolume({}, "track")).toBe(1);
    expect(getNormalizationVolume(null, "album")).toBe(1);
  });

  test("matches two tracks mastered at different levels", () => {
    // The server levels to -18 LUFS: a -8 LUFS master carries -10 dB and a
    // -14 LUFS one -4 dB. After the gain both sit 18 dB under full scale.
    const loud = { lufs: -8, gains: { normalizationGain: -10 } };
    const quiet = { lufs: -14, gains: { normalizationGain: -4 } };
    const level = ({ lufs, gains }: typeof loud) =>
      lufs + 20 * Math.log10(getNormalizationVolume(gains, "track"));

    expect(level(loud)).toBeCloseTo(-18, 10);
    expect(level(quiet)).toBeCloseTo(-18, 10);
  });
});

describe("toTrackNormalizationGains", () => {
  test("carries both gains over", () => {
    expect(
      toTrackNormalizationGains({
        NormalizationGain: -7.5,
        AlbumNormalizationGain: -5,
      }),
    ).toEqual({ normalizationGain: -7.5, albumNormalizationGain: -5 });
  });

  test("leaves a missing gain off instead of sending a placeholder", () => {
    expect(
      toTrackNormalizationGains({
        NormalizationGain: null,
        AlbumNormalizationGain: undefined,
      }),
    ).toEqual({});
  });

  test("keeps a 0 dB gain", () => {
    expect(toTrackNormalizationGains({ NormalizationGain: 0 })).toEqual({
      normalizationGain: 0,
    });
  });

  test("drops a gain that is not a finite number", () => {
    expect(
      toTrackNormalizationGains({
        NormalizationGain: Number.NaN,
        AlbumNormalizationGain: Number.NEGATIVE_INFINITY,
      }),
    ).toEqual({});
  });
});
