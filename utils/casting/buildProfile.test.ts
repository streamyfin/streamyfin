import { describe, expect, test } from "bun:test";
import { buildChromecastProfile } from "./buildProfile";
import { CONSERVATIVE_CAPABILITIES } from "./capabilities";

describe("buildChromecastProfile", () => {
  test("conservative caps produce an H.264-only video codec list", () => {
    const profile = buildChromecastProfile(CONSERVATIVE_CAPABILITIES);
    const videoCodecProfile = profile.CodecProfiles?.find(
      (c) => c.Type === "Video",
    );
    expect(videoCodecProfile?.Codec).toBe("h264");
  });

  test("HEVC-capable caps include hevc in the video codec list", () => {
    const profile = buildChromecastProfile({
      ...CONSERVATIVE_CAPABILITIES,
      hevc: true,
    });
    const videoCodecProfile = profile.CodecProfiles?.find(
      (c) => c.Type === "Video",
    );
    expect(videoCodecProfile?.Codec).toContain("hevc");
  });

  test("maxVideoBitrate drives MaxStreamingBitrate", () => {
    const profile = buildChromecastProfile({
      ...CONSERVATIVE_CAPABILITIES,
      maxVideoBitrate: 5_000_000,
    });
    expect(profile.MaxStreamingBitrate).toBe(5_000_000);
  });

  test("maxAudioChannels constrains transcoding profiles", () => {
    const profile = buildChromecastProfile(CONSERVATIVE_CAPABILITIES);
    const videoTranscode = profile.TranscodingProfiles?.find(
      (p) => p.Type === "Video",
    );
    expect(videoTranscode?.MaxAudioChannels).toBe("2");
  });

  test("non-10bit HEVC caps add a video bit-depth condition", () => {
    const profile = buildChromecastProfile({
      ...CONSERVATIVE_CAPABILITIES,
      hevc: true,
      hevc10bit: false,
    });
    const videoCodecProfile = profile.CodecProfiles?.find(
      (c) => c.Type === "Video",
    );
    const bitDepthCondition = videoCodecProfile?.Conditions?.find(
      (cond) => cond.Property === "VideoBitDepth",
    );
    expect(bitDepthCondition).toBeDefined();
  });
});
