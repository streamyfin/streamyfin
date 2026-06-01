import { describe, expect, test } from "bun:test";
import { CONSERVATIVE_CAPABILITIES, detectCapabilities } from "./capabilities";

describe("detectCapabilities", () => {
  test("unknown device falls back to the conservative baseline", () => {
    const caps = detectCapabilities(
      { modelName: "Some Unknown TV" },
      { profileMode: "auto" },
    );
    expect(caps).toEqual(CONSERVATIVE_CAPABILITIES);
  });

  test("null device falls back to the conservative baseline", () => {
    const caps = detectCapabilities(null, { profileMode: "auto" });
    expect(caps).toEqual(CONSERVATIVE_CAPABILITIES);
  });

  test('plain "Chromecast" (gen 1/2/3) gets the conservative baseline', () => {
    const caps = detectCapabilities(
      { modelName: "Chromecast" },
      { profileMode: "auto" },
    );
    expect(caps.hevc).toBe(false);
    expect(caps.maxResolution).toBe(1080);
    expect(caps.maxAudioChannels).toBe(2);
  });

  test("Chromecast Ultra is recognised with HEVC + 4K", () => {
    const caps = detectCapabilities(
      { modelName: "Chromecast Ultra" },
      { profileMode: "auto" },
    );
    expect(caps.hevc).toBe(true);
    expect(caps.maxResolution).toBe(2160);
  });

  test('"force-h264" override disables HEVC even on a capable device', () => {
    const caps = detectCapabilities(
      { modelName: "Chromecast Ultra" },
      { profileMode: "force-h264" },
    );
    expect(caps.hevc).toBe(false);
    expect(caps.hevc10bit).toBe(false);
  });

  test('"force-hevc" override enables HEVC on the conservative baseline', () => {
    const caps = detectCapabilities(
      { modelName: "Chromecast" },
      { profileMode: "force-hevc" },
    );
    expect(caps.hevc).toBe(true);
  });

  test("maxBitrate override clamps but never raises the bitrate", () => {
    const lowered = detectCapabilities(
      { modelName: "Chromecast" },
      { profileMode: "auto", maxBitrate: 3_000_000 },
    );
    expect(lowered.maxVideoBitrate).toBe(3_000_000);

    const raised = detectCapabilities(
      { modelName: "Chromecast" },
      { profileMode: "auto", maxBitrate: 999_000_000 },
    );
    expect(raised.maxVideoBitrate).toBe(
      CONSERVATIVE_CAPABILITIES.maxVideoBitrate,
    );
  });
});
