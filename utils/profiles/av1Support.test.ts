// `probe` is what the native hardware check answers (undefined when the module
// is missing). `directPlay` and `transcode` are what the profiles should then
// advertise: AV1 direct play, and AV1 over MP4 segments for transcodes.
for (const scenario of [
  {
    name: "iPhone with hardware AV1",
    os: "ios",
    isTV: false,
    probe: true,
    directPlay: true,
    transcode: true,
  },
  {
    name: "iPhone without hardware AV1",
    os: "ios",
    isTV: false,
    probe: false,
    directPlay: false,
    transcode: false,
  },
  {
    name: "iPhone with an unavailable probe",
    os: "ios",
    isTV: false,
    probe: undefined,
    directPlay: true,
    transcode: true,
  },
  {
    name: "Apple TV without hardware AV1",
    os: "ios",
    isTV: true,
    probe: false,
    directPlay: false,
    transcode: false,
  },
  // No Apple TV decodes AV1 today; one that does gets it with no code change.
  {
    name: "Apple TV with hardware AV1",
    os: "ios",
    isTV: true,
    probe: true,
    directPlay: true,
    transcode: true,
  },
  {
    name: "Apple TV with an unavailable probe",
    os: "ios",
    isTV: true,
    probe: undefined,
    directPlay: false,
    transcode: false,
  },
  // mpv plays AV1 on any Android device through dav1d, but only asks the
  // server for AV1 when MediaCodec can decode it in hardware.
  {
    name: "Android phone with a hardware AV1 decoder",
    os: "android",
    isTV: false,
    probe: true,
    directPlay: true,
    transcode: true,
  },
  {
    name: "Android phone without a hardware AV1 decoder",
    os: "android",
    isTV: false,
    probe: false,
    directPlay: true,
    transcode: false,
  },
  {
    name: "Android phone with an unavailable probe",
    os: "android",
    isTV: false,
    probe: undefined,
    directPlay: true,
    transcode: false,
  },
  {
    name: "Android TV with a hardware AV1 decoder",
    os: "android",
    isTV: true,
    probe: true,
    directPlay: true,
    transcode: true,
  },
] as const) {
  test(`${scenario.name}: streaming and downloads use the native capability result`, () => {
    const probe = jest.fn(() => scenario.probe);
    // codecSupport caches the probe and the profiles read Platform when they
    // load, so each scenario gets a module registry of its own.
    jest.isolateModules(() => {
      jest.doMock("expo", () => ({
        requireOptionalNativeModule: () =>
          scenario.probe === undefined
            ? null
            : { supportsAv1HardwareDecode: probe },
      }));
      const { Platform } =
        require("react-native") as typeof import("react-native");
      Object.defineProperty(Platform, "OS", {
        value: scenario.os,
        configurable: true,
      });
      Object.defineProperty(Platform, "isTV", {
        value: scenario.isTV,
        configurable: true,
      });
      const { generateDeviceProfile } =
        require("./native") as typeof import("./native");
      const { generateDownloadProfile } =
        require("./download") as typeof import("./download");
      const streaming = generateDeviceProfile({ platform: scenario.os });
      const download = generateDownloadProfile();
      const codecs = scenario.transcode ? "av1,h264,hevc" : "h264,hevc";
      const video = streaming.TranscodingProfiles.find(
        (p) => p.Type === "Video",
      );
      expect(video?.VideoCodec).toBe(codecs);
      expect(video?.Container).toBe(scenario.transcode ? "mp4" : "ts");
      const direct = streaming.DirectPlayProfiles.find(
        (p) => p.Type === "Video",
      );
      expect(direct?.VideoCodec?.split(",").includes("av1")).toBe(
        scenario.directPlay,
      );
      const downloaded = download.TranscodingProfiles?.find(
        (p) => p.Type === "Video",
      );
      expect(downloaded?.VideoCodec).toBe(codecs);
      expect(downloaded?.Container).toBe("mp4");
      expect(downloaded?.Protocol).toBe("http");
    });
    if (scenario.probe !== undefined) expect(probe).toHaveBeenCalled();
  });
}
