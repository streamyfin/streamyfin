import { afterEach, expect, mock, test } from "bun:test";
import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative();
const { Platform } = await import("react-native");
const originalTV = Platform.isTV;

const clearProfiles = () => {
  for (const path of ["./download", "./native", "./codecSupport"]) {
    delete require.cache[require.resolve(path)];
  }
};

afterEach(() => {
  Platform.isTV = originalTV;
  mock.module("expo", () => ({ requireOptionalNativeModule: () => null }));
  clearProfiles();
});

for (const scenario of [
  { name: "iPhone with hardware AV1", isTV: false, supported: true },
  { name: "Apple TV without hardware AV1", isTV: true, supported: false },
  {
    name: "Apple TV with an unavailable probe",
    isTV: true,
    supported: undefined,
  },
]) {
  test(`${scenario.name}: streaming and downloads use the native capability result`, () => {
    clearProfiles();
    Platform.isTV = scenario.isTV;
    const probe = mock(() => scenario.supported);
    mock.module("expo", () => ({
      requireOptionalNativeModule: () =>
        scenario.supported === undefined
          ? null
          : { supportsAv1HardwareDecode: probe },
    }));
    const { generateDeviceProfile } =
      require("./native") as typeof import("./native");
    const { generateDownloadProfile } =
      require("./download") as typeof import("./download");
    const streaming = generateDeviceProfile({ platform: "ios" });
    const download = generateDownloadProfile();
    const codecs = scenario.supported ? "av1,h264,hevc" : "h264,hevc";
    const video = streaming.TranscodingProfiles.find((p) => p.Type === "Video");
    expect(video?.VideoCodec).toBe(codecs);
    expect(video?.Container).toBe(scenario.supported ? "mp4" : "ts");
    const direct = streaming.DirectPlayProfiles.find((p) => p.Type === "Video");
    expect(direct?.VideoCodec?.split(",").includes("av1")).toBe(
      scenario.supported === true,
    );
    const downloaded = download.TranscodingProfiles?.find(
      (p) => p.Type === "Video",
    );
    expect(downloaded?.VideoCodec).toBe(codecs);
    expect(downloaded?.Container).toBe("mp4");
    expect(downloaded?.Protocol).toBe("http");
    if (scenario.supported !== undefined) expect(probe).toHaveBeenCalled();
  });
}
