const mockDocuments =
  "file:///var/mobile/Containers/Data/Application/9F8E7D6C-0000-4000-8000-000000000002/Documents/";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("expo-file-system", () => ({
  Paths: { document: { uri: mockDocuments } },
}));

import type { DownloadedItem } from "./types";

// The database caches what it parsed in module state, so every test loads it, and the store
// it reads, from a fresh module registry.
let database: typeof import("./database");
let storage: typeof import("@/utils/mmkv").storage;

const oldDocuments =
  "file:///var/mobile/Containers/Data/Application/0A1B2C3D-0000-4000-8000-000000000001/Documents/";

const downloadedBefore = (documents: string): DownloadedItem =>
  ({
    item: { Id: "movie-1", Type: "Movie", Name: "Some Movie" },
    mediaSource: {
      MediaStreams: [
        {
          Type: "Subtitle",
          DeliveryUrl: `${documents}some_movie_1999.subtitle.2.srt`,
        },
        {
          Type: "Subtitle",
          DeliveryUrl: "https://jellyfin.example/Videos/movie-1/Subtitles/3",
        },
      ],
    },
    videoFilePath: `${documents}some_movie_1999.mp4`,
    videoFileName: "some_movie_1999.mp4",
    videoFileSize: 1,
    trickPlayData: { path: `${documents}some_movie_1999_trickplay/`, size: 1 },
    userData: {},
  }) as unknown as DownloadedItem;

beforeEach(() => {
  jest.resetModules();
  database = require("./database");
  storage = require("@/utils/mmkv").storage;
});

// #2252: an iOS update moved the app's container, the stored paths still named the old one,
// and every download made before the update failed to play until it was downloaded again.
describe("a download saved before an iOS update moved the app's container", () => {
  beforeEach(() => {
    storage.set(
      "downloads.v2.json",
      JSON.stringify({
        movies: { "movie-1": downloadedBefore(oldDocuments) },
        series: {},
        other: {},
      }),
    );
  });

  it("plays its video from the current container", () => {
    const item = database.getDownloadedItemById("movie-1");
    expect(item?.videoFilePath).toBe(`${mockDocuments}some_movie_1999.mp4`);
  });

  it("finds its trickplay sheets and subtitles in the current container", () => {
    const item = database.getDownloadedItemById("movie-1");
    expect(item?.trickPlayData?.path).toBe(
      `${mockDocuments}some_movie_1999_trickplay/`,
    );
    expect(item?.mediaSource.MediaStreams?.map((s) => s.DeliveryUrl)).toEqual([
      `${mockDocuments}some_movie_1999.subtitle.2.srt`,
      "https://jellyfin.example/Videos/movie-1/Subtitles/3",
    ]);
  });
});

// A download started before the update and finished after it is added with the paths it was
// started with.
it("stores a download added with old container paths under the current one", () => {
  database.addDownloadedItem(downloadedBefore(oldDocuments));
  const stored = JSON.parse(storage.getString("downloads.v2.json") ?? "{}");
  expect(stored.movies["movie-1"].videoFilePath).toBe(
    `${mockDocuments}some_movie_1999.mp4`,
  );
});

// The paths are fixed up as the database is loaded, so a stored database that lacks one of
// its sections must still load, with the downloads it does have moved over.
it.each([
  ["no series", { movies: { "movie-1": downloadedBefore(oldDocuments) } }],
  [
    "a series without seasons",
    {
      movies: { "movie-1": downloadedBefore(oldDocuments) },
      series: { "series-1": { seriesInfo: {} } },
    },
  ],
  [
    "a season without episodes",
    {
      movies: { "movie-1": downloadedBefore(oldDocuments) },
      series: { "series-1": { seriesInfo: {}, seasons: { 1: {} } } },
    },
  ],
])("loads a stored database with %s", (_label, stored) => {
  storage.set("downloads.v2.json", JSON.stringify(stored));
  expect(database.getDownloadsDatabase().movies["movie-1"].videoFilePath).toBe(
    `${mockDocuments}some_movie_1999.mp4`,
  );
  expect(database.getAllDownloadedItems().map((i) => i.item.Id)).toEqual([
    "movie-1",
  ]);
});

// A damaged entry used to cost nothing at load; the fix-up now reads every item, so it has to
// step over one rather than stop the app from reading any download.
it.each([
  ["a null subtitle stream", (streams: unknown[]) => [null, ...streams]],
  ["streams stored as an object", () => ({})],
])("loads a stored database with %s or a null episode", (_label, damage) => {
  const movie = downloadedBefore(oldDocuments);
  movie.mediaSource.MediaStreams = damage(
    movie.mediaSource.MediaStreams ?? [],
  ) as never;
  storage.set(
    "downloads.v2.json",
    JSON.stringify({
      movies: { "movie-1": movie },
      series: {
        "series-1": {
          seriesInfo: {},
          seasons: { 1: { episodes: { 1: null } } },
        },
      },
      other: {},
    }),
  );
  expect(database.getDownloadedItemById("movie-1")?.videoFilePath).toBe(
    `${mockDocuments}some_movie_1999.mp4`,
  );
});

// The sections a stored database lacks are there for the next download too, not just for
// reading the ones it has.
it("adds an episode to a stored database that lacks its series", () => {
  storage.set(
    "downloads.v2.json",
    JSON.stringify({ movies: { "movie-1": downloadedBefore(oldDocuments) } }),
  );
  const episode = {
    ...downloadedBefore(mockDocuments),
    item: {
      Id: "episode-1",
      Type: "Episode",
      SeriesId: "series-1",
      ParentIndexNumber: 1,
      IndexNumber: 1,
    },
  } as unknown as DownloadedItem;

  database.addDownloadedItem(episode);
  expect(database.getDownloadedItemById("episode-1")).toBeDefined();
  expect(database.removeDownloadedItem("movie-1")).toBeDefined();
});

// Android's files directory never moves, so nothing stored there is rewritten, not even a
// path that names another app's directory.
it("leaves every stored path alone on Android", () => {
  require("@/test-utils/reactNative").stubReactNative({ OS: "android" });
  const files = "file:///data/user/0/com.fredrikburmester.streamyfin/files/";
  const other = "file:///data/user/0/com.other.app/files/some_movie_1999.mp4";
  jest.requireMock("expo-file-system").Paths.document.uri = files;
  storage.set(
    "downloads.v2.json",
    JSON.stringify({
      movies: {
        "movie-1": { ...downloadedBefore(files), videoFilePath: other },
      },
      series: {},
      other: {},
    }),
  );
  try {
    expect(database.getDownloadedItemById("movie-1")?.videoFilePath).toBe(
      other,
    );
  } finally {
    jest.requireMock("expo-file-system").Paths.document.uri = mockDocuments;
    require("@/test-utils/reactNative").stubReactNative({ OS: "ios" });
  }
});

// An entry with no item to describe it is not a download either: the lookups that index items
// by their id would trip on it.
it("finds a download stored next to an entry with no item", () => {
  storage.set(
    "downloads.v2.json",
    JSON.stringify({
      movies: { broken: {}, "movie-1": downloadedBefore(oldDocuments) },
      series: {},
      other: {},
    }),
  );
  expect(database.getDownloadedItemById("movie-1")?.videoFilePath).toBe(
    `${mockDocuments}some_movie_1999.mp4`,
  );
});
