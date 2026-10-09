import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { removeWatchedFromWatchlist } from "./watchlistPrune";

type Library = Record<string, BaseItemDto>;

/**
 * A Jellyfin double serving `library` by id, the Likes-filtered children of a
 * parent for /Items, and recording every rating change it receives.
 */
const serve = (library: Library) => {
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
    unliked.push(url.pathname.split("/")[2]);
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
    failures: [],
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
    failures: [],
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

test("fetches a season and show shared by a batch once", async () => {
  const library = show(false, false);
  library.ep2 = { ...library.ep, Id: "ep2" };
  const { api } = serve(library);

  await removeWatchedFromWatchlist(api, "u", ["ep", "ep2"]);
  expect(getsFor(api, "s1")).toBe(1);
  expect(getsFor(api, "show")).toBe(1);
});

// The ratings cleared before the failure are on the server already; losing
// them would leave the app showing those items as watchlisted.
test("reports the items it removed when a later one fails", async () => {
  const { api, unliked } = serve({
    m1: { Id: "m1", Type: "Movie", ...userData(true, true) },
    m3: { Id: "m3", Type: "Movie", ...userData(true, true) },
  });

  const result = await removeWatchedFromWatchlist(api, "u", ["m1", "m2", "m3"]);

  expect(result.removed).toEqual(["m1", "m3"]);
  expect(result.failures).toHaveLength(1);
  expect(unliked).toEqual(["m1", "m3"]);
});
