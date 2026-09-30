import { stubReactNative } from "@/test-utils/reactNative";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// BitrateSelector is a React component module; only the BITRATES table matters.
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
// JellyfinProvider drags in react-native-device-info (native at test time);
// settings.ts only reads its atoms.
jest.mock("@/providers/JellyfinProvider", () => ({
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

// Android TV: the only platform where ExoPlayer ships alongside a
// native-player toggle, so the only place the engine/controls split is
// observable end to end.
stubReactNative({ OS: "android", isTV: true });

// Required after the platform is set, not imported: settings.ts reads
// Platform once, when the module is evaluated.
const {
  getActivePlayerType,
  getActiveVideoPlayer,
  getActiveVideoPlayerEngine,
  isNativeChromeActive,
  VideoPlayer,
} = require("./settings") as typeof import("./settings");

describe("engine vs chrome resolution on Android TV", () => {
  test("the engine is honored while the native chrome is on", () => {
    const s = {
      videoPlayer: VideoPlayer.ExoPlayer,
      nativeVideoPlayerAndroidTV: true,
    };
    expect(isNativeChromeActive(s)).toBe(true); // chrome renders
    expect(getActivePlayerType(s)).toBe("exoplayer"); // engine still exo
    expect(getActiveVideoPlayerEngine(s)).toBe(VideoPlayer.ExoPlayer);
  });

  test("exo engine with the chrome off renders the exo JS view", () => {
    const s = {
      videoPlayer: VideoPlayer.ExoPlayer,
      nativeVideoPlayerAndroidTV: false,
    };
    expect(isNativeChromeActive(s)).toBe(false);
    expect(getActiveVideoPlayer(s)).toBe(VideoPlayer.ExoPlayer);
    expect(getActivePlayerType(s)).toBe("exoplayer");
  });

  test("toggle on from the mpv default keeps the mpv profile", () => {
    const s = { nativeVideoPlayerAndroidTV: true };
    expect(isNativeChromeActive(s)).toBe(true);
    expect(getActivePlayerType(s)).toBe("mpv");
    expect(getActiveVideoPlayer({})).toBe(VideoPlayer.MPV);
    expect(getActiveVideoPlayerEngine({})).toBe(VideoPlayer.MPV);
  });

  test("an unset engine pick resolves to mpv everywhere", () => {
    expect(getActivePlayerType({})).toBe("mpv");
    expect(getActiveVideoPlayerEngine(undefined)).toBe(VideoPlayer.MPV);
  });
});
