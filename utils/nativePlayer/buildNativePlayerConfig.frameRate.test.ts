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
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);

// Android TV: the only platform where the native chrome carries a content
// frame rate to the display-mode matcher.
stubReactNative({ OS: "android", isTV: true });

// Required after the platform is set, not imported: settings.ts reads
// Platform once, when the module is evaluated.
const { buildNativePlayerConfig } =
  require("./buildNativePlayerConfig") as typeof import("./buildNativePlayerConfig");
const { buildNativePlayerStrings } =
  require("./buildNativePlayerConfig") as typeof import("./buildNativePlayerConfig");
const { defaultValues } =
  require("@/utils/atoms/settings") as typeof import("@/utils/atoms/settings");

const strings = buildNativePlayerStrings(
  ((key: string) => key) as unknown as TFunction,
);

const item = { Id: "item-1", Type: "Movie", Name: "A Movie" };

// 25fps HEVC in MKV: the exact case that judders on a 60Hz panel, because an
// MKV gives the demuxer no frame rate and only the server knows the real one.
const mediaSource = {
  Id: "ms-1",
  Name: "Direct",
  Path: "/media/episode.mkv",
  Protocol: "File",
  Container: "mkv",
  MediaStreams: [
    { Type: "Video", Index: 0, Width: 3840, Height: 2160, RealFrameRate: 25 },
  ],
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

const build = (settings: Record<string, unknown>) =>
  buildNativePlayerConfig({
    api: makeConfiguredApi(),
    userId: "user-1",
    settings: { ...defaultValues, ...settings },
    req: { itemId: "item-1", offline: false },
    getDownloadedItemById: () => undefined,
    strings,
    originalLabel: "Original",
  });

// The native session switches the display mode to match this rate, so the
// rate may only ride along when the user opted in — the native side never
// reads settings, and a mode switch without opt-in is a black flash.
describe("contentFrameRate is opt-in wire data", () => {
  test("carries the video stream's RealFrameRate when enabled", async () => {
    const result = await build({ matchRefreshRate: true });
    expect(result?.config.stream.contentFrameRate).toBe(25);
  });

  test("is absent by default", async () => {
    const result = await build({});
    expect(result?.config.stream.contentFrameRate).toBeUndefined();
  });

  test("is absent when the stream reports no RealFrameRate", async () => {
    const api = makeApi();
    api.mock.onGet(/\/Items\/item-1\?userId=user-1$/).reply(200, item);
    api.mock.onPost(/\/Items\/item-1\/PlaybackInfo$/).reply(200, {
      PlaySessionId: "session-1",
      MediaSources: [
        {
          ...mediaSource,
          MediaStreams: [
            { Type: "Video", Index: 0, Width: 3840, Height: 2160 },
          ],
        },
      ],
    });
    const result = await buildNativePlayerConfig({
      api,
      userId: "user-1",
      settings: { ...defaultValues, matchRefreshRate: true },
      req: { itemId: "item-1", offline: false },
      getDownloadedItemById: () => undefined,
      strings,
      originalLabel: "Original",
    });
    expect(result?.config.stream.contentFrameRate).toBeUndefined();
  });
});
