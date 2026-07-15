import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { atom } from "jotai";

// --- Module-boundary stubs (React Native / Expo can't load under bun:test) ---
mock.module("react-native", () => ({
  Platform: {
    OS: "ios",
    isTV: false,
    select: (spec: Record<string, unknown>) => spec.ios ?? spec.default,
  },
}));
mock.module("@/components/BitrateSelector", () => ({}));
mock.module("@/providers/JellyfinProvider", () => ({
  apiAtom: atom<Api | null>(null),
}));

// Fake expo-file-system that records download calls instead of hitting disk.
type RecordedDownload = {
  url: string;
  destination: string;
  options?: { headers?: Record<string, string> };
};
const downloads: RecordedDownload[] = [];

class FakeDirectory {
  uri: string;
  exists = true;
  constructor(...parts: (string | FakeDirectory)[]) {
    this.uri = `${parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/")}/`;
  }
  create() {}
}
class FakeFile {
  uri: string;
  exists = false;
  size = 0;
  constructor(...parts: (string | FakeDirectory | FakeFile)[]) {
    this.uri = parts
      .map((p) => (typeof p === "string" ? p : p.uri.replace(/\/$/, "")))
      .join("/");
  }
  static downloadFileAsync = async (
    url: string,
    destination: FakeFile,
    options?: { headers?: Record<string, string> },
  ) => {
    downloads.push({ url, destination: destination.uri, options });
    return destination;
  };
}
mock.module("expo-file-system", () => ({
  Directory: FakeDirectory,
  File: FakeFile,
  Paths: { document: "file:///documents" },
}));

const { apiAtom } = await import("@/providers/JellyfinProvider");
const { store } = await import("@/utils/store");
const { makeApi } = await import("@/test-utils/jellyfinApi");
const { downloadTrickplayImages, downloadSubtitles } = await import(
  "./additionalDownloads"
);

const api = makeApi();

const trickplayItem: BaseItemDto = {
  Id: "item-1",
  Name: "Some Movie",
  Type: "Movie",
  RunTimeTicks: 36_000_000_000, // 1 hour → 4 sheets at 10s interval, 100 tiles
  Trickplay: {
    "item-1": {
      "320": {
        Interval: 10_000,
        TileWidth: 10,
        TileHeight: 10,
        Width: 320,
        Height: 180,
      },
    },
  },
};

beforeEach(() => {
  downloads.length = 0;
  store.set(apiAtom, api);
});

describe("downloadTrickplayImages", () => {
  test("downloads every sheet with the Authorization header", async () => {
    await downloadTrickplayImages(trickplayItem, api);

    expect(downloads).toEqual(
      [0, 1, 2, 3].map((index) => ({
        url: `https://jellyfin.example.com/Videos/item-1/Trickplay/320/${index}.jpg`,
        destination: `file:///documents/some_movie__trickplay/${index}.jpg`,
        options: {
          headers: {
            Authorization:
              'MediaBrowser DeviceId="device-1", Token="SECRET_TOKEN"',
          },
        },
      })),
    );
  });
});

describe("downloadSubtitles", () => {
  test("downloads external subtitles with the Authorization header and rewrites DeliveryUrl to the local file", async () => {
    const mediaSource: MediaSourceInfo = {
      MediaStreams: [
        {
          Type: "Subtitle",
          DeliveryMethod: "External",
          DeliveryUrl: "/Videos/item-1/subs/3/Stream.srt",
          Index: 3,
          Codec: "srt",
        },
      ],
    };

    const result = await downloadSubtitles(mediaSource, trickplayItem, api);

    expect(downloads).toEqual([
      {
        url: "https://jellyfin.example.com/Videos/item-1/subs/3/Stream.srt",
        destination: "file:///documents/some_movie__subtitle_3.srt",
        options: {
          headers: {
            Authorization:
              'MediaBrowser DeviceId="device-1", Token="SECRET_TOKEN"',
          },
        },
      },
    ]);
    expect(result.MediaStreams?.[0].DeliveryUrl).toBe(
      "file:///documents/some_movie__subtitle_3.srt",
    );
  });
});
