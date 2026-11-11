import { requireOnPlatform } from "@/test-utils/reactNative";

type Platform = Parameters<typeof requireOnPlatform>[0];

/**
 * What the device profile is told on `platform`, in a binary that ships
 * `modules`. codecSupport caches the probe and reads Platform when it loads,
 * so each call gets a module registry of its own.
 */
const dolbyVisionOn = (platform: Platform, modules: Record<string, object>) =>
  requireOnPlatform(platform, () => {
    jest.doMock("expo", () => ({
      requireOptionalNativeModule: (name: string) => modules[name] ?? null,
    }));
    const { supportsDolbyVisionHardwareDecode } =
      require("./codecSupport") as typeof import("./codecSupport");
    return supportsDolbyVisionHardwareDecode();
  });

const ANDROID_TV: Platform = { OS: "android", isTV: true };

describe("Dolby Vision Profile 5 direct play", () => {
  test("an Android TV with a Profile 5 decoder plays it directly", () => {
    const probe = jest.fn(() => true);

    expect(
      dolbyVisionOn(ANDROID_TV, {
        MpvPlayer: { supportsDolbyVisionDecode: probe },
      }),
    ).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  test("an Android TV without one keeps transcoding", () => {
    expect(
      dolbyVisionOn(ANDROID_TV, {
        MpvPlayer: { supportsDolbyVisionDecode: () => false },
      }),
    ).toBe(false);
  });

  // The probe sat on the ExoPlayer view's module until that view went. A
  // binary answers from the module it ships, never from one it no longer has:
  // asking the old one would send every Dolby Vision TV back to transcoding
  // without an error anywhere.
  test("the probe is the player module's", () => {
    expect(
      dolbyVisionOn(ANDROID_TV, {
        ExoPlayer: { supportsDolbyVisionDecode: () => true },
      }),
    ).toBe(false);
  });

  test("a binary without the probe keeps transcoding", () => {
    expect(dolbyVisionOn(ANDROID_TV, { MpvPlayer: {} })).toBe(false);
    expect(dolbyVisionOn(ANDROID_TV, {})).toBe(false);
  });

  test("a probe that throws keeps transcoding", () => {
    expect(
      dolbyVisionOn(ANDROID_TV, {
        MpvPlayer: {
          supportsDolbyVisionDecode: () => {
            throw new Error("MediaCodecList failed");
          },
        },
      }),
    ).toBe(false);
  });

  test.each<[string, Platform]>([
    ["an Android phone", { OS: "android", isTV: false }],
    ["an Apple TV", { OS: "ios", isTV: true }],
  ])("%s is not asked", (_device, platform) => {
    const probe = jest.fn(() => true);

    expect(
      dolbyVisionOn(platform, {
        MpvPlayer: { supportsDolbyVisionDecode: probe },
      }),
    ).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });
});
