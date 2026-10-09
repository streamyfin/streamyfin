import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { removeWatchedFromWatchlist } from "./watchlistPrune";

type Library = Record<string, BaseItemDto>;

/**
 * A Jellyfin double serving `library` by id, the Likes-filtered children of a
 * parent for /Items, and recording every rating change it receives. Rating
 * changes for the ids in `failRatingFor` fail with a 500.
 */
const serve = (library: Library, failRatingFor: string[] = []) => {
  const api = makeApi();
  const unliked: string[] = [];

  api.mock.onGet(/\/Items\/[^/?]+(\?|$)/).reply((config) => {
    const id = config.url?.match(/\/Items\/([^/?]+)/)?.[1] ?? "";
    return library[id] ? [200, library[id]] : [404];
  });
  api.mock.onGet(/\/Items(\?|$)/).reply((config) => {
    const parentId = new URL(config.url ?? "", "https://x").searchParams.get(
      "parentId",
    );
    const items = Object.values(library).filter(
      (item) =>
        (item.SeasonId === parentId || item.SeriesId === parentId) &&
        item.UserData?.Likes,
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

const userData = (played: boolean, likes: boolean) => ({
  UserData: { Played: played, Likes: likes },
});

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
    SeriesId: "show",
    ...userData(seasonPlayed, true),
  },
  show: { Id: "show", Type: "Series", ...userData(seriesPlayed, true) },
});

test("finishing an episode mid-season removes only the episode", async () => {
  const { api, unliked } = serve(show(false, false));

  await removeWatchedFromWatchlist(api, "u", ["ep"]);
  expect(unliked).toEqual(["ep"]);
});

test("finishing a season's last episode removes the season too", async () => {
  const { api, unliked } = serve(show(true, false));

  await removeWatchedFromWatchlist(api, "u", ["ep"]);
  expect(unliked).toEqual(["ep", "s1"]);
});

test("finishing a show's last episode removes the show too", async () => {
  const { api, unliked } = serve(show(true, true));

  await removeWatchedFromWatchlist(api, "u", ["ep"]);
  expect(unliked).toEqual(["ep", "s1", "show"]);
});

test("marking a whole show played clears its watchlisted seasons and episodes", async () => {
  const { api, unliked } = serve(show(true, true));

  await removeWatchedFromWatchlist(api, "u", ["show"]);
  expect(unliked.sort()).toEqual(["ep", "s1", "show"]);
});

test("removes each item once when several share a season", async () => {
  const library = show(true, false);
  library.ep2 = { ...library.ep, Id: "ep2" };
  const { api, unliked } = serve(library);

  await removeWatchedFromWatchlist(api, "u", ["ep", "ep2"]);
  expect(unliked).toEqual(["ep", "s1", "ep2"]);
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
