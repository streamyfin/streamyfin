import { describe, expect, mock, test } from "bun:test";
import { atom } from "jotai";
import { stubMmkv } from "@/test-utils/mmkv";
import { stubReactNative } from "@/test-utils/reactNative";

// Android TV: the only platform where ExoPlayer ships alongside a
// native-player toggle, so the only place the engine/controls split is
// observable end to end.
stubReactNative({ OS: "android", isTV: true });
stubMmkv();
// BitrateSelector is a React component module; only the BITRATES table matters.
mock.module("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
// JellyfinProvider drags in react-native-device-info (native at test time);
// settings.ts only reads its atoms.
mock.module("@/providers/JellyfinProvider", () => ({
  apiAtom: atom(null),
  userAtom: atom(null),
}));
// Full surface: mock.module re-links every importer, and a missing export
// breaks whichever OTHER spec's module links after this file.
mock.module("@/utils/log", () => ({
  writeToLog: () => undefined,
  logAndCaptureError: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  readFromLog: () => [],
  useLog: () => ({ logs: [], clearLogs: () => undefined }),
  LogProvider: ({ children }: { children: unknown }) => children,
  default: atom([]),
}));

const {
  getActivePlayerType,
  getActiveVideoPlayer,
  getActiveVideoPlayerEngine,
  isNativeChromeActive,
  VideoPlayer,
} = await import("./settings");

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
