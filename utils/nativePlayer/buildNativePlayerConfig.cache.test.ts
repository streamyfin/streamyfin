import type { TFunction } from "i18next";
import { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";

// BitrateSelector is a React component module; only the BITRATES table matters.
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
// The api atoms read react-native-device-info (native at test time);
// settings.ts only reads the atoms.
jest.mock("@/utils/atoms/api", () => ({
  apiAtom: jest.requireActual("jotai").atom(null),
  userAtom: jest.requireActual("jotai").atom(null),
}));
// The log module reaches Sentry and MMKV, so it is stubbed with the surface
// settings.ts and what it imports actually call.
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  logAndCaptureError: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  readFromLog: () => [],
  useLog: () => ({ logs: [], clearLogs: () => undefined }),
  LogProvider: ({ children }: { children: unknown }) => children,
  default: jest.requireActual("jotai").atom([]),
}));
// The custom-header barrel touches MMKV and SecureStore; the shared double
// keeps the pure helpers real.
// Auto, the default quality, measures the server through NetInfo, which has
// no native module here; these specs are not about the quality, so the
// measure finds nothing and the stream is asked for as under Max.
jest.mock("@/utils/jellyfin/bitrateTest", () => ({
  detectBitrate: async () => undefined,
}));
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);

// The prefetch downloads through expo-file-system (its own spec); here only
// whether the builder asks for it, and for which subtitle, matters.
jest.mock("./externalSubtitles", () => ({
  prefetchExternalSubtitles: jest.fn(async () => undefined),
}));
// Android TV: the only platform where ExoPlayer can be the engine, so the
// only place the mpv-only cacheConfig split is observable.
stubReactNative({ OS: "android", isTV: true });

// Required after the platform is set, not imported: settings.ts reads
// Platform once, when the module is evaluated.
const { buildNativePlayerConfig } =
  require("./buildNativePlayerConfig") as typeof import("./buildNativePlayerConfig");
const { buildNativePlayerStrings } =
  require("./buildNativePlayerConfig") as typeof import("./buildNativePlayerConfig");
const { defaultValues, VideoPlayer } =
  require("@/utils/atoms/settings") as typeof import("@/utils/atoms/settings");
const { prefetchExternalSubtitles }: { prefetchExternalSubtitles: jest.Mock } =
  jest.requireMock("./externalSubtitles");

const strings = buildNativePlayerStrings(
  ((key: string) => key) as unknown as TFunction,
);

const item = { Id: "item-1", Type: "Movie", Name: "A Movie" };

const mediaSource = {
  Id: "ms-1",
  Name: "Direct",
  Path: "/media/movie.mp4",
  Protocol: "File",
  Container: "mp4",
  MediaStreams: [{ Type: "Video", Index: 0, Width: 1920, Height: 1080 }],
};

const makeConfiguredApi = () => {
  const api = makeApi();
  // The SDK's getItem routes to /Items/{id} with the userId as a query.
  api.mock.onGet(/\/Items\/item-1\?userId=user-1$/).reply(200, item);
  api.mock
    .onPost(/\/Items\/item-1\/PlaybackInfo$/)
    .reply(200, { PlaySessionId: "session-1", MediaSources: [mediaSource] });
  return api;
};

// The native player never sends mpv's demuxer-cache knobs to ExoPlayer: the
// engine derives its LoadControl internally and the settings UI hides the
// buffer section when ExoPlayer is selected, so stale hidden values must not
// ride along and imply they still steer playback.
describe("cacheConfig is mpv-only wire data", () => {
  test("rides along for the mpv engine", async () => {
    const result = await buildNativePlayerConfig({
      api: makeConfiguredApi(),
      userId: "user-1",
      settings: {
        ...defaultValues,
        mpvCacheEnabled: "yes",
        mpvCacheSeconds: 45,
        mpvDemuxerMaxBytes: 200,
        mpvDemuxerMaxBackBytes: 40,
      },
      req: { itemId: "item-1", offline: false },
      getDownloadedItemById: () => undefined,
      strings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) => bitrate.key,
    });

    expect(result?.config.engine).toBe("mpv");
    expect(result?.config.stream.cacheConfig).toEqual({
      enabled: "yes",
      cacheSeconds: 45,
      maxBytes: 200,
      maxBackBytes: 40,
    });
  });

  test("is omitted when ExoPlayer is the engine", async () => {
    const result = await buildNativePlayerConfig({
      api: makeConfiguredApi(),
      userId: "user-1",
      settings: { ...defaultValues, videoPlayer: VideoPlayer.ExoPlayer },
      req: { itemId: "item-1", offline: false },
      getDownloadedItemById: () => undefined,
      strings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) => bitrate.key,
    });

    expect(result?.config.engine).toBe("exoplayer");
    expect(result?.config.stream.cacheConfig).toBeUndefined();
    // The stream negotiation itself is engine-agnostic: still direct play.
    expect(result?.config.stream.url).toContain("/Videos/item-1/stream?");
    expect(result?.config.stream.url).toContain("static=true");
  });
});

// The "Video output" setting is mpv's `vo`. The native player started mpv on
// gpu-next whatever the setting said, so a device that only plays on gpu had
// no way to choose it there.
describe("the video output driver", () => {
  test("is the one the setting names", async () => {
    const result = await buildNativePlayerConfig({
      api: makeConfiguredApi(),
      userId: "user-1",
      settings: { ...defaultValues, mpvVoDriver: "gpu" },
      req: { itemId: "item-1", offline: false },
      getDownloadedItemById: () => undefined,
      strings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) => bitrate.key,
    });

    expect(result?.config.engine).toBe("mpv");
    expect(result?.config.voDriver).toBe("gpu");
  });

  // Like cacheConfig: the settings UI hides the section for ExoPlayer, and a
  // hidden value must not ride along as if it steered playback.
  test("is omitted when ExoPlayer is the engine", async () => {
    const result = await buildNativePlayerConfig({
      api: makeConfiguredApi(),
      userId: "user-1",
      settings: {
        ...defaultValues,
        videoPlayer: VideoPlayer.ExoPlayer,
        mpvVoDriver: "gpu",
      },
      req: { itemId: "item-1", offline: false },
      getDownloadedItemById: () => undefined,
      strings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) => bitrate.key,
    });

    expect(result?.config.engine).toBe("exoplayer");
    expect(result?.config.voDriver).toBeUndefined();
  });
});

// ExoPlayer wedges on a sidecar it must fetch over a slow path, so it gets
// its sidecars on disk first; mpv opens each one on a thread of its own and
// starts without that wait.
describe("the sidecar subtitle prefetch", () => {
  beforeEach(() => {
    prefetchExternalSubtitles.mockClear();
  });

  test("runs before an ExoPlayer load, the session's subtitle first", async () => {
    await buildNativePlayerConfig({
      api: makeConfiguredApi(),
      userId: "user-1",
      settings: { ...defaultValues, videoPlayer: VideoPlayer.ExoPlayer },
      req: {
        itemId: "item-1",
        offline: false,
        audioIndex: 1,
        subtitleIndex: 3,
      },
      getDownloadedItemById: () => undefined,
      strings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) => bitrate.key,
    });

    expect(prefetchExternalSubtitles).toHaveBeenCalledTimes(1);
    expect(prefetchExternalSubtitles.mock.calls[0]?.[0]).toMatchObject({
      mediaSource: { Id: "ms-1" },
      item: { Id: "item-1" },
      preferredIndex: 3,
    });
  });

  // Subtitles are optional: a prefetch that throws must not keep the stream
  // from playing.
  test("a failing prefetch still builds the config", async () => {
    prefetchExternalSubtitles.mockRejectedValueOnce(new Error("disk full"));

    const result = await buildNativePlayerConfig({
      api: makeConfiguredApi(),
      userId: "user-1",
      settings: { ...defaultValues, videoPlayer: VideoPlayer.ExoPlayer },
      req: {
        itemId: "item-1",
        offline: false,
        audioIndex: 1,
        subtitleIndex: 3,
      },
      getDownloadedItemById: () => undefined,
      strings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) => bitrate.key,
    });

    expect(result?.config.stream.url).toContain("/Videos/item-1/stream?");
  });

  test("is skipped for mpv, which fetches its sidecars itself", async () => {
    const result = await buildNativePlayerConfig({
      api: makeConfiguredApi(),
      userId: "user-1",
      settings: defaultValues,
      req: {
        itemId: "item-1",
        offline: false,
        audioIndex: 1,
        subtitleIndex: 3,
      },
      getDownloadedItemById: () => undefined,
      strings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) => bitrate.key,
    });

    expect(result?.config.engine).toBe("mpv");
    expect(prefetchExternalSubtitles).not.toHaveBeenCalled();
  });
});
