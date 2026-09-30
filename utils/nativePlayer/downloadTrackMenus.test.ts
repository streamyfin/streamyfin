import { describe, expect, mock, test } from "bun:test";
import { atom } from "jotai";
import type { DownloadedItem } from "@/providers/Downloads/types";
import { stubCustomHeaders } from "@/test-utils/customHeaders";
import { stubMmkv } from "@/test-utils/mmkv";
import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative();
stubMmkv();
stubCustomHeaders();
mock.module("expo", () => ({ requireOptionalNativeModule: () => null }));
mock.module("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
mock.module("@/providers/JellyfinProvider", () => ({
  apiAtom: atom(null),
  userAtom: atom(null),
}));
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
mock.module("@/packages/expo-screen-orientation", () => ({
  OrientationLock: {},
}));

const { buildTrackMenus } = await import("./buildNativePlayerConfig");
const { getMpvAudioId } = await import("@/utils/jellyfin/subtitleUtils");

/** A downloaded MKV whose audio order differs from the source numbering. */
const download: DownloadedItem = {
  item: { Id: "movie", Type: "Movie" },
  mediaSource: {
    Container: "mkv",
    MediaStreams: [
      { Index: 0, Type: "Video", Codec: "h264" },
      { Index: 7, Type: "Audio", Codec: "aac", DisplayTitle: "English" },
      { Index: 3, Type: "Audio", Codec: "aac", DisplayTitle: "Japanese" },
      {
        Index: 9,
        Type: "Subtitle",
        Codec: "srt",
        IsTextSubtitleStream: true,
        DeliveryMethod: "External",
        DeliveryUrl: "file:///documents/subtitle.srt",
      },
    ],
  },
  videoFilePath: "file:///documents/movie.mkv",
  videoFileSize: 1000,
  userData: {
    audioStreamIndex: 7,
    subtitleStreamIndex: -1,
    isTranscoded: true,
    isMultiTrack: true,
  },
};

describe("downloaded track menus", () => {
  test("multi-track MKVs expose every downloaded audio without server reloads", () => {
    const menu = buildTrackMenus({
      mediaSource: download.mediaSource,
      audioIndex: 3,
      subtitleIndex: -1,
      offline: true,
      downloadedItem: download,
      offLabel: "Off",
    });
    expect(menu.audio.map((track) => track.jellyfinIndex)).toEqual([7, 3]);
    expect(menu.audio[1].selected).toBe(true);
    expect(menu.audio.every((track) => !track.requiresReload)).toBe(true);
    expect(menu.subtitles.map((track) => track.jellyfinIndex)).toEqual([-1, 9]);
    expect(menu.quality).toEqual([]);
    expect(getMpvAudioId(download.mediaSource, 7, false)).toBe(1);
    expect(getMpvAudioId(download.mediaSource, 3, false)).toBe(2);
  });

  test("legacy transcodes still expose only their downloaded audio", () => {
    const legacy = {
      ...download,
      userData: { ...download.userData, isMultiTrack: undefined },
    };
    const menu = buildTrackMenus({
      mediaSource: legacy.mediaSource,
      audioIndex: 7,
      subtitleIndex: -1,
      offline: true,
      downloadedItem: legacy,
      offLabel: "Off",
    });
    expect(menu.audio.map((track) => track.jellyfinIndex)).toEqual([7]);
  });
});
