import type { TFunction } from "i18next";
import { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
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
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);

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
    });

    expect(result?.config.engine).toBe("exoplayer");
    expect(result?.config.stream.cacheConfig).toBeUndefined();
    // The stream negotiation itself is engine-agnostic: still direct play.
    expect(result?.config.stream.url).toContain("/Videos/item-1/stream?");
    expect(result?.config.stream.url).toContain("static=true");
  });
});
