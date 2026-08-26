import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { stubReactNative } from "@/test-utils/reactNative";

// --- Module-boundary stubs: keep the native surface out of this spec ---
stubReactNative();
jest.mock("expo", () => ({
  // codecSupport probes the native MPV module, which no test environment has.
  requireOptionalNativeModule: () => null,
}));
jest.mock("@/components/BitrateSelector", () => ({}));
// The custom-header barrel re-exports modules with native dependencies (MMKV,
// SecureStore). Replace it with the real pure helpers plus a resolver stub.
jest.mock("@/utils/customHeaders", () => ({
  normalizeCustomHeaders: jest.requireActual("@/utils/customHeaders/normalize")
    .normalizeCustomHeaders,
  optionsWithOptionalHeaders: jest.requireActual(
    "@/utils/customHeaders/optionalHeaders",
  ).optionsWithOptionalHeaders,
  // No proxy headers configured in these specs.
  getJellyfinHeadersForUrl: () => undefined,
}));
jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: jest.requireActual("jotai").atom(null),
}));

// Fake expo-file-system that records download calls instead of hitting disk.
type RecordedDownload = {
  url: string;
  destination: string;
  options?: { headers?: Record<string, string> };
};
const downloads: RecordedDownload[] = [];
let inFlight = 0;
let maxInFlight = 0;

class mockFakeDirectory {
  uri: string;
  exists = true;
  constructor(...parts: (string | mockFakeDirectory)[]) {
    this.uri = `${parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/")}/`;
  }
  create() {}
}
class mockFakeFile {
  uri: string;
  exists = false;
  size = 0;
  constructor(...parts: (string | mockFakeDirectory | mockFakeFile)[]) {
    this.uri = parts
      .map((p) => (typeof p === "string" ? p : p.uri.replace(/\/$/, "")))
      .join("/");
  }
  static downloadFileAsync = async (
    url: string,
    destination: mockFakeFile,
    options?: { headers?: Record<string, string> },
  ) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--;
    downloads.push({ url, destination: destination.uri, options });
    return destination;
  };
}
// jest.mock is hoisted above the class declarations, so the classes are read
// through getters: by the time the module under test touches them, their
// temporal dead zone is over.
jest.mock("expo-file-system", () => ({
  get Directory() {
    return mockFakeDirectory;
  },
  get File() {
    return mockFakeFile;
  },
  Paths: { document: "file:///documents" },
}));

import { apiAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import { store } from "@/utils/store";
import {
  downloadAdditionalAssets,
  downloadSubtitles,
  downloadTrickplayImages,
} from "./additionalDownloads";

const api = makeApi();
// makeApi() throws on unmatched requests; the segment fetch is not under test.
api.mock.onGet(/\/MediaSegments\//).reply(200, { Items: [] });

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
  inFlight = 0;
  maxInFlight = 0;
  store.set(apiAtom, api);
});

describe("downloadTrickplayImages", () => {
  test("downloads every sheet from the authenticated sheet URL", async () => {
    await downloadTrickplayImages(trickplayItem, api);

    expect(downloads).toEqual(
      [0, 1, 2, 3].map((index) => ({
        url: `https://jellyfin.example.com/Videos/item-1/Trickplay/320/${index}.jpg?ApiKey=SECRET_TOKEN`,
        destination: `file:///documents/some_movie__trickplay/${index}.jpg`,
        options: {},
      })),
    );
  });

  test("builds sheet URLs from the passed api, not the global store", async () => {
    store.set(apiAtom, null);

    await downloadTrickplayImages(trickplayItem, api);

    expect(downloads.map((download) => download.url)).toEqual([
      "https://jellyfin.example.com/Videos/item-1/Trickplay/320/0.jpg?ApiKey=SECRET_TOKEN",
      "https://jellyfin.example.com/Videos/item-1/Trickplay/320/1.jpg?ApiKey=SECRET_TOKEN",
      "https://jellyfin.example.com/Videos/item-1/Trickplay/320/2.jpg?ApiKey=SECRET_TOKEN",
      "https://jellyfin.example.com/Videos/item-1/Trickplay/320/3.jpg?ApiKey=SECRET_TOKEN",
    ]);
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

  test("downloads an IsExternalUrl subtitle from its absolute url with no Jellyfin credentials", async () => {
    const mediaSource: MediaSourceInfo = {
      MediaStreams: [
        {
          Type: "Subtitle",
          DeliveryMethod: "External",
          DeliveryUrl: "https://subs.example.org/opensubtitles/9/Stream.srt",
          IsExternalUrl: true,
          Index: 9,
          Codec: "srt",
        },
      ],
    };

    await downloadSubtitles(mediaSource, trickplayItem, api);

    expect(downloads).toEqual([
      {
        url: "https://subs.example.org/opensubtitles/9/Stream.srt",
        destination: "file:///documents/some_movie__subtitle_9.srt",
        options: {},
      },
    ]);
  });

  test("downloads subtitles one at a time (concurrent extraction corrupts Jellyfin's output)", async () => {
    const mediaSource: MediaSourceInfo = {
      MediaStreams: [0, 1, 2].map((index) => ({
        Type: "Subtitle",
        DeliveryMethod: "External",
        DeliveryUrl: `/Videos/item-1/subs/${index}/Stream.srt`,
        Index: index,
        Codec: "srt",
      })),
    };

    await downloadSubtitles(mediaSource, trickplayItem, api);

    expect(downloads.length).toBe(3);
    expect(maxInFlight).toBe(1);
  });
});

describe("downloadAdditionalAssets", () => {
  test("downloads external subtitles for a transcoded media source", async () => {
    const mediaSource: MediaSourceInfo = {
      TranscodingUrl: "/videos/item-2/stream.ts?PlaySessionId=session-1",
      MediaStreams: [
        {
          Type: "Subtitle",
          DeliveryMethod: "External",
          DeliveryUrl: "/Videos/item-2/subs/2/Stream.srt",
          Index: 2,
          Codec: "srt",
        },
      ],
    };
    const item: BaseItemDto = { Id: "item-2", Name: "Some Movie" };

    const result = await downloadAdditionalAssets({
      item,
      mediaSource,
      api,
      saveImageFn: async () => {},
      saveSeriesImageFn: async () => {},
    });

    expect(downloads).toEqual([
      {
        url: "https://jellyfin.example.com/Videos/item-2/subs/2/Stream.srt",
        destination: "file:///documents/item-2_subtitle_2.srt",
        options: {
          headers: {
            Authorization:
              'MediaBrowser DeviceId="device-1", Token="SECRET_TOKEN"',
          },
        },
      },
    ]);
    expect(result.updatedMediaSource.MediaStreams?.[0].DeliveryUrl).toBe(
      "file:///documents/item-2_subtitle_2.srt",
    );
  });
});
