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

// `probe` is what the native check answers (undefined when the module is
// missing), `av1` is what the profiles should advertise as a result.
for (const scenario of [
  { name: "iPhone with hardware AV1", isTV: false, probe: true, av1: true },
  {
    name: "iPhone without hardware AV1",
    isTV: false,
    probe: false,
    av1: false,
  },
  {
    name: "iPhone with an unavailable probe",
    isTV: false,
    probe: undefined,
    av1: true,
  },
  {
    name: "Apple TV without hardware AV1",
    isTV: true,
    probe: false,
    av1: false,
  },
  // No Apple TV decodes AV1 today; one that does gets it with no code change.
  { name: "Apple TV with hardware AV1", isTV: true, probe: true, av1: true },
  {
    name: "Apple TV with an unavailable probe",
    isTV: true,
    probe: undefined,
    av1: false,
  },
]) {
  test(`${scenario.name}: streaming and downloads use the native capability result`, () => {
    clearProfiles();
    Platform.isTV = scenario.isTV;
    const probe = mock(() => scenario.probe);
    mock.module("expo", () => ({
      requireOptionalNativeModule: () =>
        scenario.probe === undefined
          ? null
          : { supportsAv1HardwareDecode: probe },
    }));
    const { generateDeviceProfile } =
      require("./native") as typeof import("./native");
    const { generateDownloadProfile } =
      require("./download") as typeof import("./download");
    const streaming = generateDeviceProfile({ platform: "ios" });
    const download = generateDownloadProfile();
    const codecs = scenario.av1 ? "av1,h264,hevc" : "h264,hevc";
    const video = streaming.TranscodingProfiles.find((p) => p.Type === "Video");
    expect(video?.VideoCodec).toBe(codecs);
    expect(video?.Container).toBe(scenario.av1 ? "mp4" : "ts");
    const direct = streaming.DirectPlayProfiles.find((p) => p.Type === "Video");
    expect(direct?.VideoCodec?.split(",").includes("av1")).toBe(scenario.av1);
    const downloaded = download.TranscodingProfiles?.find(
      (p) => p.Type === "Video",
    );
    expect(downloaded?.VideoCodec).toBe(codecs);
    expect(downloaded?.Container).toBe("mp4");
    expect(downloaded?.Protocol).toBe("http");
    if (scenario.probe !== undefined) expect(probe).toHaveBeenCalled();
  });
}
