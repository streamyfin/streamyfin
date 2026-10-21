import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import {
  lastPlayedDatesAtStart,
  removeWatchedFromWatchlist,
} from "./watchlistPrune";

type Library = Record<string, BaseItemDto>;

/** Every folder `item` sits under: its season, show and parent, and theirs. */
const ancestorsOf = (item: BaseItemDto, library: Library): string[] =>
  [item.SeasonId, item.SeriesId, item.ParentId]
    .filter((id): id is string => !!id)
    .flatMap((id) => [
      id,
      ...(library[id] ? ancestorsOf(library[id], library) : []),
    ]);

/**
 * A Jellyfin double serving `library` by id, everything under a parent for a
 * recursive /Items (only what is liked when the Likes filter is asked for),
 * and recording every rating change it receives. Rating changes for the ids in
 * `failRatingFor` fail with a 500.
 */
const serve = (library: Library, failRatingFor: string[] = []) => {
  const api = makeApi();
  const unliked: string[] = [];

  api.mock.onGet(/\/Items\/[^/?]+(\?|$)/).reply((config) => {
    const id = config.url?.match(/\/Items\/([^/?]+)/)?.[1] ?? "";
    return library[id] ? [200, library[id]] : [404];
  });
  api.mock.onGet(/\/Items(\?|$)/).reply((config) => {
    const query = new URL(config.url ?? "", "https://x").searchParams;
    const parentId = query.get("parentId") ?? "";
    expect(query.get("recursive")).toBe("true");
    const likedOnly = query.getAll("filters").includes("Likes");
    const items = Object.values(library).filter(
      (item) =>
        ancestorsOf(item, library).includes(parentId) &&
        (!likedOnly || item.UserData?.Likes),
    );
    return [200, { Items: items }];
  });
  api.mock.onPost(/\/UserItems\/[^/]+\/Rating/).reply((config) => {
    const url = new URL(config.url ?? "", "https://x");
    expect(url.searchParams.get("likes")).toBe("false");
    const id = url.pathname.split("/")[2];
    if (failRatingFor.includes(id)) return [500];
    unliked.push(id);
    return [200, {}];
  });

  return { api, unliked };
};

/** The server sends the resume position with every item, 0 when there is none. */
const userData = (played: boolean, likes: boolean, positionTicks = 0) => ({
  UserData: {
    Played: played,
    Likes: likes,
    PlaybackPositionTicks: positionTicks,
  },
});

/** 31 s, where the rewatch in the review of #2171 was left. */
const ABANDONED_AT_TICKS = 310_000_000;

test("takes a finished, watchlisted movie off the watchlist", async () => {
  const { api, unliked } = serve({
    m1: { Id: "m1", Type: "Movie", ...userData(true, true) },
  });

  await expect(removeWatchedFromWatchlist(api, "u", ["m1"])).resolves.toEqual({
    removed: ["m1"],
    failed: [],
  });
  expect(unliked).toEqual(["m1"]);
});

// A stop report fires for a movie abandoned halfway too; the server, not the
// caller, says whether it is finished.
test("leaves an unfinished movie on the watchlist", async () => {
  const { api, unliked } = serve({
    m1: { Id: "m1", Type: "Movie", ...userData(false, true) },
  });

  await expect(removeWatchedFromWatchlist(api, "u", ["m1"])).resolves.toEqual({
    removed: [],
    failed: [],
  });
  expect(unliked).toEqual([]);
});

// Jellyfin 12 no longer clears Played when a played item starts again
// (jellyfin#15762): a rewatch left part way still reads as played, and only
// the resume point the server kept says it was not finished.
test("leaves a played movie on the watchlist when a rewatch of it was left with a resume point", async () => {
  const { api, unliked } = serve({
    m1: {
      Id: "m1",
      Type: "Movie",
      ...userData(true, true, ABANDONED_AT_TICKS),
    },
  });

  await expect(removeWatchedFromWatchlist(api, "u", ["m1"])).resolves.toEqual({
    removed: [],
    failed: [],
  });
  expect(unliked).toEqual([]);
});

/** A two hour movie, so 5% is six minutes in and 90% is 1 h 48 min. */
const RUNTIME_TICKS = 72_000_000_000;
const HALFWAY_TICKS = RUNTIME_TICKS / 2;
/** When the movie was last watched, a month before this playback. */
const LAST_MONTH = "2026-09-21T20:00:00.0000000Z";
/** When this playback's start report and stop report reached the server. */
const AT_START = "2026-10-21T15:00:00.0000000Z";
const AT_STOP = "2026-10-21T15:00:31.0000000Z";

type Outcome = "leaves the watchlist" | "stays on the watchlist";

/**
 * What the server returns for a watchlisted movie after a stop report, by
 * version and outcome, and whether the movie leaves the watchlist. The player
 * read the movie's LastPlayedDate before playback started (null: never
 * played).
 *
 * 10.11.0: the start report clears Played and sets LastPlayedDate
 * (SessionManager.OnPlaybackStart); progress and stop reports leave the date
 * alone. 12.2: the start report sets the date for an unplayed item only and
 * keeps Played; a progress or stop report sets it once playback completes or
 * keeps a resume point. On both, a stop under the minimum resume percentage
 * (5%) drops the position and leaves Played as it was, and one past the
 * maximum (90%) marks the item played with its position reset
 * (UserDataManager.UpdatePlayState).
 */
const AFTER_STOP: [
  string,
  Outcome,
  string | null,
  { Played: boolean; PlaybackPositionTicks: number; LastPlayedDate: string },
][] = [
  [
    "10.11, a first watch finished",
    "leaves the watchlist",
    null,
    { Played: true, PlaybackPositionTicks: 0, LastPlayedDate: AT_START },
  ],
  [
    "10.11, a rewatch finished",
    "leaves the watchlist",
    LAST_MONTH,
    { Played: true, PlaybackPositionTicks: 0, LastPlayedDate: AT_START },
  ],
  [
    "10.11, a rewatch left under 5%",
    "stays on the watchlist",
    LAST_MONTH,
    { Played: false, PlaybackPositionTicks: 0, LastPlayedDate: AT_START },
  ],
  [
    "10.11, a rewatch left between 5% and 90%",
    "stays on the watchlist",
    LAST_MONTH,
    {
      Played: false,
      PlaybackPositionTicks: HALFWAY_TICKS,
      LastPlayedDate: AT_START,
    },
  ],
  [
    "12.2, a first watch finished",
    "leaves the watchlist",
    null,
    { Played: true, PlaybackPositionTicks: 0, LastPlayedDate: AT_STOP },
  ],
  [
    "12.2, a rewatch finished",
    "leaves the watchlist",
    LAST_MONTH,
    { Played: true, PlaybackPositionTicks: 0, LastPlayedDate: AT_STOP },
  ],
  [
    "12.2, a first watch left under 5%",
    "stays on the watchlist",
    null,
    { Played: false, PlaybackPositionTicks: 0, LastPlayedDate: AT_START },
  ],
  [
    "12.2, a first watch left between 5% and 90%",
    "stays on the watchlist",
    null,
    {
      Played: false,
      PlaybackPositionTicks: HALFWAY_TICKS,
      LastPlayedDate: AT_STOP,
    },
  ],
  // The review of #2171: a played movie put back on the watchlist, played
  // 31 s and left, lost its entry right after the stop report.
  [
    "12.2, a rewatch left under 5%",
    "stays on the watchlist",
    LAST_MONTH,
    { Played: true, PlaybackPositionTicks: 0, LastPlayedDate: LAST_MONTH },
  ],
  [
    "12.2, a rewatch left between 5% and 90%",
    "stays on the watchlist",
    LAST_MONTH,
    {
      Played: true,
      PlaybackPositionTicks: HALFWAY_TICKS,
      LastPlayedDate: AT_STOP,
    },
  ],
];

test.each(AFTER_STOP)(
  "Jellyfin %s: the movie %s",
  async (_label, outcome, lastPlayedAtStart, afterStop) => {
    const { api, unliked } = serve({
      m1: {
        Id: "m1",
        Type: "Movie",
        RunTimeTicks: RUNTIME_TICKS,
        UserData: { ...afterStop, Likes: true },
      },
    });

    await removeWatchedFromWatchlist(
      api,
      "u",
      ["m1"],
      new Map([["m1", lastPlayedAtStart]]),
    );

    expect(unliked).toEqual(outcome === "leaves the watchlist" ? ["m1"] : []);
  },
);

// Marking an item played says nothing about a playback, so there is no date
// to compare and the server's Played is the whole answer.
test("takes an item marked played off the watchlist whatever its LastPlayedDate", async () => {
  const { api, unliked } = serve({
    m1: {
      Id: "m1",
      Type: "Movie",
      UserData: {
        ...userData(true, true).UserData,
        LastPlayedDate: LAST_MONTH,
      },
    },
  });

  await removeWatchedFromWatchlist(api, "u", ["m1"]);
  expect(unliked).toEqual(["m1"]);
});

test("a stop report compares against the LastPlayedDate the item had when playback started", () => {
  const movie: BaseItemDto = {
    Id: "m1",
    UserData: { LastPlayedDate: LAST_MONTH },
  };

  expect(lastPlayedDatesAtStart(movie, "m1")).toEqual(
    new Map([["m1", LAST_MONTH]]),
  );
  expect(lastPlayedDatesAtStart({ Id: "m2" }, undefined)).toEqual(
    new Map([["m2", null]]),
  );
});

// Jellyfin 12 writes an alternate version's playback to the version's own
// UserData and only copies Played over to the item, never the date: compared
// against the item, a finished version would never leave the watchlist.
test("a stop report of an alternate version leaves the date out", () => {
  const movie: BaseItemDto = {
    Id: "m1",
    MediaSources: [{ Id: "m1" }, { Id: "m1-4k" }],
    UserData: { LastPlayedDate: LAST_MONTH },
  };

  expect(lastPlayedDatesAtStart(movie, "m1-4k")).toBeUndefined();
  expect(lastPlayedDatesAtStart(movie, "m1")).toEqual(
    new Map([["m1", LAST_MONTH]]),
  );
});

test("leaves a finished item alone when it was never watchlisted", async () => {
  const { api, unliked } = serve({
    m1: { Id: "m1", Type: "Movie", ...userData(true, false) },
  });

  await removeWatchedFromWatchlist(api, "u", ["m1"]);
  expect(unliked).toEqual([]);
});

const show = (seasonPlayed: boolean, seriesPlayed: boolean): Library => ({
  ep: {
    Id: "ep",
    Type: "Episode",
    SeasonId: "s1",
    SeriesId: "show",
    ...userData(true, true),
  },
  s1: {
    Id: "s1",
    Type: "Season",
    IsFolder: true,
    SeriesId: "show",
    ...userData(seasonPlayed, true),
  },
  show: {
    Id: "show",
    Type: "Series",
    IsFolder: true,
    ...userData(seriesPlayed, true),
  },
});

test("finishing an episode mid-season removes only the episode", async () => {
  const { api, unliked } = serve(show(false, false));

  await removeWatchedFromWatchlist(api, "u", ["ep"]);
  expect(unliked).toEqual(["ep"]);
});

test("finishing a season's last episode removes the season too", async () => {
  const { api, unliked } = serve(show(true, false));

  await removeWatchedFromWatchlist(api, "u", ["ep"]);
  expect(unliked.sort()).toEqual(["ep", "s1"]);
});

test("finishing a show's last episode removes the show too", async () => {
  const { api, unliked } = serve(show(true, true));

  await removeWatchedFromWatchlist(api, "u", ["ep"]);
  expect(unliked.sort()).toEqual(["ep", "s1", "show"]);
});

// Season and show are finished from before the rewatch, and on Jellyfin 12
// stay that way through it: only the episode's resume point says it was left.
test("an episode rewatch left with a resume point leaves its season and show on the watchlist", async () => {
  const library = show(true, true);
  library.ep.UserData = userData(true, true, ABANDONED_AT_TICKS).UserData;
  const { api, unliked } = serve(library);

  await removeWatchedFromWatchlist(api, "u", ["ep"]);
  expect(unliked).toEqual([]);
});

test("marking a whole show played clears its watchlisted seasons and episodes", async () => {
  const { api, unliked } = serve(show(true, true));

  await removeWatchedFromWatchlist(api, "u", ["show"]);
  expect(unliked.sort()).toEqual(["ep", "s1", "show"]);
});

/** The /Items requests a prune sent, as their query strings. */
const childQueries = (api: ReturnType<typeof serve>["api"]) =>
  api.mock.history.get
    .filter((request) => request.url?.match(/\/Items(\?|$)/))
    .map((request) => new URL(request.url ?? "", "https://x").searchParams);

// The action sheet marks a collection or a folder played the way it marks a
// show: the server marks every item under it. Only a show and a season had
// their watchlisted items cleared.
test("marking a collection played clears the watchlisted movies and shows in it", async () => {
  const library: Library = {
    ...show(true, true),
    box: {
      Id: "box",
      Type: "BoxSet",
      IsFolder: true,
      ...userData(true, false),
    },
    m1: { Id: "m1", Type: "Movie", ParentId: "box", ...userData(true, true) },
    m2: { Id: "m2", Type: "Movie", ParentId: "box", ...userData(true, false) },
  };
  library.show.ParentId = "box";
  const { api, unliked } = serve(library);

  await removeWatchedFromWatchlist(api, "u", ["box"]);

  expect(unliked.sort()).toEqual(["ep", "m1", "s1", "show"]);
  // One request, for what is on the watchlist only, not every item inside.
  const [query, ...more] = childQueries(api);
  expect(more).toEqual([]);
  expect(query.get("parentId")).toBe("box");
  expect(query.getAll("filters")).toEqual(["Likes"]);
});

test("marking a folder played clears the watchlisted items in its subfolders", async () => {
  const { api, unliked } = serve({
    home: {
      Id: "home",
      Type: "Folder",
      IsFolder: true,
      ...userData(true, false),
    },
    trip: {
      Id: "trip",
      Type: "Folder",
      IsFolder: true,
      ParentId: "home",
      ...userData(true, false),
    },
    v1: { Id: "v1", Type: "Video", ParentId: "trip", ...userData(true, true) },
  });

  await removeWatchedFromWatchlist(api, "u", ["home"]);
  expect(unliked).toEqual(["v1"]);
});

// Jellyfin computes a show's or a collection's Played from its items, but not
// a library's: that one keeps its own, unset, however many items are marked.
test("clears the watchlisted items of a library marked played, which never reads as played itself", async () => {
  const { api, unliked } = serve({
    movies: {
      Id: "movies",
      Type: "CollectionFolder",
      IsFolder: true,
      ...userData(false, false),
    },
    m1: {
      Id: "m1",
      Type: "Movie",
      ParentId: "movies",
      ...userData(true, true),
    },
  });

  await removeWatchedFromWatchlist(api, "u", ["movies"]);
  expect(unliked).toEqual(["m1"]);
});

test("removes each item once when several share a season", async () => {
  const library = show(true, false);
  library.ep2 = { ...library.ep, Id: "ep2" };
  const { api, unliked } = serve(library);

  await removeWatchedFromWatchlist(api, "u", ["ep", "ep2"]);
  expect(unliked.sort()).toEqual(["ep", "ep2", "s1"]);
});

// A batch is housekeeping for every id in it: one item the server cannot
// serve must not leave the rest of the batch on the watchlist.
test("carries on past an item that fails to load", async () => {
  const { api, unliked } = serve({
    m2: { Id: "m2", Type: "Movie", ...userData(true, true) },
  });

  const result = await removeWatchedFromWatchlist(api, "u", ["gone", "m2"]);

  expect(unliked).toEqual(["m2"]);
  expect(result.removed).toEqual(["m2"]);
  expect(result.failed).toEqual(["gone"]);
});

test("carries on past a rating update that fails", async () => {
  const { api, unliked } = serve(
    {
      m1: { Id: "m1", Type: "Movie", ...userData(true, true) },
      m2: { Id: "m2", Type: "Movie", ...userData(true, true) },
    },
    ["m1"],
  );

  const result = await removeWatchedFromWatchlist(api, "u", ["m1", "m2"]);

  expect(unliked).toEqual(["m2"]);
  expect(result.removed).toEqual(["m2"]);
  expect(result.failed).toEqual(["m1"]);
});

const getsFor = (api: ReturnType<typeof serve>["api"], id: string) =>
  api.mock.history.get.filter((request) =>
    request.url?.match(new RegExp(`/Items/${id}(\\?|$)`)),
  ).length;

// An unfinished episode cannot have finished its season or show, so their
// lookups would only cost round trips.
test("does not look up the parents of an unfinished episode", async () => {
  const library = show(false, false);
  library.ep.UserData = { Played: false, Likes: true };
  const { api, unliked } = serve(library);

  await removeWatchedFromWatchlist(api, "u", ["ep"]);

  expect(unliked).toEqual([]);
  expect(getsFor(api, "s1")).toBe(0);
  expect(getsFor(api, "show")).toBe(0);
});

// Marking a season played passes every episode in it; without sharing the
// lookups that is a season and a show request per episode.
test("fetches a season and show shared by a batch once", async () => {
  const library = show(false, false);
  library.ep2 = { ...library.ep, Id: "ep2" };
  const { api } = serve(library);

  await removeWatchedFromWatchlist(api, "u", ["ep", "ep2"]);

  expect(getsFor(api, "s1")).toBe(1);
  expect(getsFor(api, "show")).toBe(1);
});

/**
 * Holds every request matching `pattern` until `count` of them are in flight
 * at once, then answers them all; a client that sends them one at a time never
 * gets past the first.
 */
const holdUntilConcurrent = (
  api: ReturnType<typeof serve>["api"],
  method: "onGet" | "onPost",
  pattern: RegExp,
  count: number,
  answer: (url: string) => [number, unknown],
) => {
  const waiting: (() => void)[] = [];
  api.mock[method](pattern).reply(
    (config) =>
      new Promise((resolve) => {
        waiting.push(() => resolve(answer(config.url ?? "")));
        if (waiting.length === count) for (const release of waiting) release();
      }),
  );
};

const withinASecond = <T>(promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("requests ran one at a time")), 1000),
    ),
  ]);

// Marking a season played passes every episode; one round trip after another
// left the watchlist stale for seconds on a slow server.
test("looks up the items of a batch in parallel", async () => {
  const library: Library = {
    m1: { Id: "m1", Type: "Movie", ...userData(true, true) },
    m2: { Id: "m2", Type: "Movie", ...userData(true, true) },
  };
  const api = makeApi();
  holdUntilConcurrent(api, "onGet", /\/Items\/m\d/, 2, (url) => [
    200,
    library[url.match(/\/Items\/([^/?]+)/)?.[1] ?? ""],
  ]);
  api.mock.onPost(/\/Rating/).reply(200, {});

  const result = await withinASecond(
    removeWatchedFromWatchlist(api, "u", ["m1", "m2"]),
  );
  expect(result.removed.sort()).toEqual(["m1", "m2"]);
});

test("sends the rating updates of a batch in parallel", async () => {
  const { api } = serve({
    m1: { Id: "m1", Type: "Movie", ...userData(true, true) },
    m2: { Id: "m2", Type: "Movie", ...userData(true, true) },
  });
  api.mock.resetHandlers();
  api.mock.onGet(/\/Items\/m1/).reply(200, {
    Id: "m1",
    Type: "Movie",
    ...userData(true, true),
  });
  api.mock.onGet(/\/Items\/m2/).reply(200, {
    Id: "m2",
    Type: "Movie",
    ...userData(true, true),
  });
  holdUntilConcurrent(api, "onPost", /\/Rating/, 2, () => [200, {}]);

  const result = await withinASecond(
    removeWatchedFromWatchlist(api, "u", ["m1", "m2"]),
  );
  expect(result.removed.sort()).toEqual(["m1", "m2"]);
});
