import { AUDIO_STORAGE_INDEX_KEY } from "@/constants/Music";
import { fakeFiles } from "@/test-utils/fileSystem";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// The double's own directories, unless a spec puts Documents and Caches in an iOS container or
// makes them unreadable.
const mockPaths: { document?: string; cache?: string; unreadable?: boolean } =
  {};
jest.mock("expo-file-system", () => {
  const { fileSystemModule } = jest.requireActual("@/test-utils/fileSystem");
  return {
    ...fileSystemModule,
    Paths: {
      get document() {
        if (mockPaths.unreadable) throw new Error("Documents is unreadable");
        return mockPaths.document
          ? new fileSystemModule.Directory(mockPaths.document)
          : fileSystemModule.Paths.document;
      },
      get cache() {
        if (mockPaths.unreadable) throw new Error("Caches is unreadable");
        return mockPaths.cache
          ? new fileSystemModule.Directory(mockPaths.cache)
          : fileSystemModule.Paths.cache;
      },
    },
  };
});
const mockStartDownload = jest.fn(async (..._args: unknown[]) => 1);
// What native would call when a download finishes.
let mockCompleteListener: ((event: unknown) => void) | undefined;
jest.mock("@/modules", () => ({
  BackgroundDownloader: {
    startDownload: (...args: unknown[]) => mockStartDownload(...args),
    addCompleteListener: (listener: (event: unknown) => void) => {
      mockCompleteListener = listener;
      return { remove() {} };
    },
    addErrorListener: () => ({ remove() {} }),
  },
}));

import { downloadTrack } from "./index";

/** The path native is told to write the track to. */
const destinationOf = async (
  itemId: string,
  container: string | undefined,
  permanent = true,
) => {
  await downloadTrack(itemId, "https://jellyfin.example/Audio/stream", {
    permanent,
    container,
  });
  return mockStartDownload.mock.calls.at(-1)?.[1];
};

beforeEach(() => {
  fakeFiles.clear();
  mockStartDownload.mockClear();
});

// AudioStorage remembers every id it has started, so each case downloads an id of its own.
describe("where a track is downloaded to", () => {
  // A stored track is found again by the path saved in the index, but the name a real server
  // leads to should not change either.
  it.each([
    [
      "a permanent download",
      true,
      "/documents/streamyfin-audio/0a1B2c3d4e5f60718293a4b5c6d7e8f9.flac",
    ],
    [
      "a look-ahead cache entry",
      false,
      "/cache/streamyfin-audio-cache/0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9.flac",
    ],
  ])(
    "is named after the item and its container, for %s",
    async (_label, permanent, path) => {
      const id = path.slice(path.lastIndexOf("/") + 1, -".flac".length);

      expect(await destinationOf(id, "FLAC", permanent)).toBe(path);
    },
  );

  it("falls back to m4a when the server names no container", async () => {
    expect(await destinationOf("no-container", undefined)).toBe(
      "/documents/streamyfin-audio/no-container.m4a",
    );
  });

  // The item id and the container are the server's to choose, and native replaces whatever is
  // already at the path it is handed. A separator or a parent-directory segment in either used
  // to steer the track out of the audio directory.
  it.each([
    [
      "an item id with a parent-directory prefix",
      "../../Documents/x",
      "mp3",
      "______Documents_x.mp3",
    ],
    ["an item id with a nested path", "sub/dir", "mp3", "sub_dir.mp3"],
    ["an item id with a backslash", "sub\\dir", "mp3", "sub_dir.mp3"],
    [
      "a container with a path in it",
      "item-9",
      "mp3/../../../Library/x",
      "item-9.mp3__________library_x",
    ],
    ["a container that is a parent directory", "item-10", "..", "item-10.__"],
  ])(
    "is a plain file in the audio directory, given %s",
    async (_label, id, container, name) => {
      expect(await destinationOf(id, container)).toBe(
        `/documents/streamyfin-audio/${name}`,
      );
    },
  );
});

// #2252 for music: an iOS update can move the app's container to a new UUID, and the index keeps
// each track's path whole, so a downloaded album was gone after an update and its files stayed
// on disk, still counted in the storage used.
describe("a track stored before an iOS update moved the app's container", () => {
  const container = (uuid: string) =>
    `/var/mobile/Containers/Data/Application/${uuid}`;
  const before = container("0A1B2C3D-0000-4000-8000-000000000001");
  const now = container("9F8E7D6C-0000-4000-8000-000000000002");

  // The index and its directories live in module state, so each case loads them, the store and
  // the fake disk from a fresh module registry.
  let audio: typeof import("./index");
  let files: typeof fakeFiles;

  const storeIndex = (
    tracks: Record<string, unknown>,
    totals = { totalCacheSize: 1, totalPermanentSize: 1 },
  ) =>
    require("@/utils/mmkv").storage.set(
      AUDIO_STORAGE_INDEX_KEY,
      JSON.stringify({ tracks, ...totals }),
    );
  const storedIndex = () =>
    JSON.parse(
      require("@/utils/mmkv").storage.getString(AUDIO_STORAGE_INDEX_KEY),
    );
  const track = (itemId: string, localPath: string, permanent: boolean) => ({
    itemId,
    localPath,
    size: 1,
    storedAt: 1,
    permanent,
  });

  beforeEach(() => {
    mockPaths.document = `file://${now}/Documents/`;
    mockPaths.cache = `file://${now}/Library/Caches/`;
    jest.resetModules();
    audio = require("./index");
    files = require("@/test-utils/fileSystem").fakeFiles;
  });

  afterEach(() => {
    mockPaths.document = undefined;
    mockPaths.cache = undefined;
    mockPaths.unreadable = false;
  });

  it("plays a downloaded track from the current container", () => {
    // Native reports the path it moved the file to, without file://, and that is what is stored.
    storeIndex({
      "track-1": track(
        "track-1",
        `${before}/Documents/streamyfin-audio/track-1.flac`,
        true,
      ),
    });
    files.add(`file://${now}/Documents/streamyfin-audio/track-1.flac`);

    expect(audio.getLocalPath("track-1")).toBe(
      `file://${now}/Documents/streamyfin-audio/track-1.flac`,
    );
    expect(audio.isPermanentlyDownloaded("track-1")).toBe(true);
  });

  it("keeps a cached track, which lives deeper in the container", () => {
    storeIndex({
      "track-2": track(
        "track-2",
        `${before}/Library/Caches/streamyfin-audio-cache/track-2.mp3`,
        false,
      ),
    });
    files.add(
      `file://${now}/Library/Caches/streamyfin-audio-cache/track-2.mp3`,
    );

    // A cache entry whose file is missing is dropped from the index, so before the fix the
    // track was forgotten, not only unplayable.
    expect(audio.isCached("track-2")).toBe(true);
    expect(audio.getStorageStats().cacheCount).toBe(1);
  });

  it("finds a track stored next to a damaged entry", () => {
    storeIndex({
      broken: null,
      "no-path": { itemId: "no-path", permanent: true },
      "track-1": track(
        "track-1",
        `${before}/Documents/streamyfin-audio/track-1.flac`,
        true,
      ),
    });
    files.add(`file://${now}/Documents/streamyfin-audio/track-1.flac`);

    expect(audio.getLocalPath("track-1")).toBe(
      `file://${now}/Documents/streamyfin-audio/track-1.flac`,
    );
  });

  // Native reports a finished file without file://, and the app opens a stored track to delete it
  // by that path as it is, so the fake disk holds these files as plain paths.
  it("deletes a downloaded track from the current container, and saves the others' new paths", async () => {
    storeIndex({
      "track-1": track(
        "track-1",
        `${before}/Documents/streamyfin-audio/track-1.flac`,
        true,
      ),
      "track-2": track(
        "track-2",
        `${before}/Documents/streamyfin-audio/track-2.flac`,
        true,
      ),
    });
    files.add(`${now}/Documents/streamyfin-audio/track-1.flac`);

    await audio.deleteTrack("track-1");

    expect(files.deleted()).toEqual([
      `${now}/Documents/streamyfin-audio/track-1.flac`,
    ]);
    expect(storedIndex().tracks).toEqual({
      "track-2": track(
        "track-2",
        `${now}/Documents/streamyfin-audio/track-2.flac`,
        true,
      ),
    });
  });

  it("clears the look-ahead cache in the current container", async () => {
    storeIndex({
      "track-2": track(
        "track-2",
        `${before}/Library/Caches/streamyfin-audio-cache/track-2.mp3`,
        false,
      ),
    });
    files.add(`${now}/Library/Caches/streamyfin-audio-cache/track-2.mp3`);

    await audio.clearCache();

    expect(files.deleted()).toEqual([
      `${now}/Library/Caches/streamyfin-audio-cache/track-2.mp3`,
    ]);
  });

  it("evicts the oldest cached track from the current container", async () => {
    const cached = (n: number) =>
      `/Library/Caches/streamyfin-audio-cache/cached-${n}.mp3`;
    // Ten cached tracks fill the cache; the oldest goes when an eleventh one arrives.
    storeIndex(
      Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
          `cached-${i}`,
          {
            ...track(`cached-${i}`, `${before}${cached(i)}`, false),
            storedAt: i,
          },
        ]),
      ),
    );
    files.add(...Array.from({ length: 10 }, (_, i) => `${now}${cached(i)}`));

    await audio.downloadTrack(
      "cached-10",
      "https://jellyfin.example/Audio/stream",
      {
        permanent: false,
        container: "mp3",
      },
    );
    mockCompleteListener?.({ taskId: 1, filePath: `${now}${cached(10)}` });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(files.deleted()).toEqual([`${now}${cached(0)}`]);
  });

  // A damaged entry broke every walk over the index: the storage stats threw on it, clearing the
  // cache rejected, and a path-less one turned the size of the downloads into NaN.
  it("drops a damaged entry when the index loads", async () => {
    storeIndex({
      broken: null,
      "no-path": { itemId: "no-path", permanent: true },
      "track-1": track(
        "track-1",
        `${before}/Documents/streamyfin-audio/track-1.flac`,
        true,
      ),
    });
    files.add(`file://${now}/Documents/streamyfin-audio/track-1.flac`);

    expect(audio.getLocalPath("no-path")).toBeNull();
    expect(audio.getStorageStats()).toEqual({
      cacheCount: 0,
      cacheSize: 0,
      permanentCount: 1,
      permanentSize: 1,
    });
    await expect(audio.clearCache()).resolves.toBeUndefined();
    expect(Object.keys(storedIndex().tracks)).toEqual(["track-1"]);
  });

  // A size that is not a number turned every total it was added to or taken from into NaN.
  it("counts a track with no size as empty", async () => {
    storeIndex({
      "track-2": {
        itemId: "track-2",
        localPath: `${before}/Library/Caches/streamyfin-audio-cache/track-2.mp3`,
        storedAt: 1,
        permanent: false,
      },
    });

    // The file is gone, so the entry leaves the index and its size leaves the total.
    expect(audio.isCached("track-2")).toBe(false);
    expect(audio.getStorageStats().cacheSize).toBe(0);
  });

  // The stored totals can count entries the load drops, or sizes it zeroes, and eviction
  // compares the cache total with the limit: a stale one evicted tracks that fit.
  it("works the totals out from the tracks it keeps", () => {
    storeIndex(
      {
        broken: null,
        "track-1": track(
          "track-1",
          `${now}/Documents/streamyfin-audio/track-1.flac`,
          true,
        ),
        "track-2": track(
          "track-2",
          `${now}/Library/Caches/streamyfin-audio-cache/track-2.mp3`,
          false,
        ),
      },
      { totalCacheSize: 5_000_000_000, totalPermanentSize: 7 },
    );

    expect(audio.getStorageStats()).toEqual({
      cacheCount: 1,
      cacheSize: 1,
      permanentCount: 1,
      permanentSize: 1,
    });
  });

  // Eviction and clearing the cache delete an entry by the id it carries, so an
  // entry whose own id is missing or names another track has to be keyed by
  // the index key, or it stays behind while another track's entry goes.
  it("names each track by its index key", async () => {
    storeIndex({
      "track-1": {
        ...track(
          "track-1",
          `${now}/Library/Caches/streamyfin-audio-cache/track-1.mp3`,
          false,
        ),
        itemId: "track-2",
      },
      "track-2": track(
        "track-2",
        `${now}/Library/Caches/streamyfin-audio-cache/track-2.mp3`,
        false,
      ),
    });

    await audio.clearCache();

    expect(storedIndex().tracks).toEqual({});
  });

  // A negative size would take bytes off the totals that other tracks fill.
  it("counts a negative size as empty", () => {
    storeIndex({
      "track-1": {
        ...track(
          "track-1",
          `${now}/Library/Caches/streamyfin-audio-cache/track-1.mp3`,
          false,
        ),
        size: -500,
      },
      "track-2": track(
        "track-2",
        `${now}/Library/Caches/streamyfin-audio-cache/track-2.mp3`,
        false,
      ),
    });

    expect(audio.getStorageStats().cacheSize).toBe(1);
  });

  // The index used to come back empty when the current directories could not be read, and the
  // next write saved that over every track.
  it("keeps the index as stored when the app's directories cannot be read", async () => {
    const stored = `${before}/Documents/streamyfin-audio/track-1.flac`;
    storeIndex({ "track-1": track("track-1", stored, true) });
    mockPaths.unreadable = true;

    await audio.clearCache();

    expect(storedIndex().tracks["track-1"]).toMatchObject({
      localPath: stored,
    });
  });

  // Android's files directory never moves, so nothing stored there is rewritten, not even a
  // path that names another app's directory.
  it("leaves every stored path alone on Android", () => {
    const { stubReactNative } = require("@/test-utils/reactNative");
    stubReactNative({ OS: "android" });
    const app = "/data/user/0/com.fredrikburmester.streamyfin";
    mockPaths.document = `file://${app}/files/`;
    mockPaths.cache = `file://${app}/cache/`;
    try {
      storeIndex({
        "track-1": track(
          "track-1",
          "/data/user/0/com.other.app/files/streamyfin-audio/track-1.flac",
          true,
        ),
      });
      files.add(`file://${app}/files/streamyfin-audio/track-1.flac`);

      expect(audio.getLocalPath("track-1")).toBeNull();
    } finally {
      stubReactNative({ OS: "ios" });
    }
  });
});
