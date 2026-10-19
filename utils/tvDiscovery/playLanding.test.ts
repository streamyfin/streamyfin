import { makeApi } from "@/test-utils/jellyfinApi";
import { getTopShelfPlayLanding, lookUpTopShelfPlayItem } from "./playLanding";

const HOME = "/(auth)/(tabs)/(home)";

// The payload builder no longer writes a play link for a container, but a tile
// published by an older build keeps the one it has until Home runs again. The
// link carries nothing but an id, so the app has to look at the item to tell.
describe("getTopShelfPlayLanding: where a play link goes when there is nothing to play", () => {
  test("an episode or a movie is played", () => {
    expect(getTopShelfPlayLanding({ Id: "ep-1", Type: "Episode" })).toBeNull();
    expect(getTopShelfPlayLanding({ Id: "movie-1", Type: "Movie" })).toBeNull();
  });

  // Pins the stale-tile half of REACT-NATIVE-54: the season id went to the
  // player, which had nothing to show but an error.
  test("a season opens its series on that season", () => {
    expect(
      getTopShelfPlayLanding({
        Id: "season-2",
        Type: "Season",
        SeriesId: "series-1",
        IndexNumber: 2,
      }),
    ).toBe(`${HOME}/series/series-1?seasonIndex=2`);
  });

  test("specials open season 0", () => {
    expect(
      getTopShelfPlayLanding({
        Id: "season-0",
        Type: "Season",
        SeriesId: "series-1",
        IndexNumber: 0,
      }),
    ).toBe(`${HOME}/series/series-1?seasonIndex=0`);
  });

  test("a series opens the series page", () => {
    expect(getTopShelfPlayLanding({ Id: "series-1", Type: "Series" })).toBe(
      `${HOME}/series/series-1`,
    );
  });

  test("any other item without a stream opens its page", () => {
    expect(getTopShelfPlayLanding({ Id: "box-1", Type: "BoxSet" })).toBe(
      `${HOME}/items/page?id=box-1`,
    );
    expect(
      getTopShelfPlayLanding({ Id: "book-1", Type: "Book", MediaType: "Book" }),
    ).toBe(`${HOME}/items/page?id=book-1`);
  });

  // Nothing is known about the item, so the link does what it says and the
  // player gets to report whatever is wrong.
  test("an item that could not be looked up is played", () => {
    expect(getTopShelfPlayLanding(null)).toBeNull();
  });
});

describe("lookUpTopShelfPlayItem: asking the server what a play link points at", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("returns the item the server knows under that id", async () => {
    const api = makeApi({ Id: "season-2", Type: "Season" });

    await expect(
      lookUpTopShelfPlayItem({ api, userId: "user-1", itemId: "season-2" }),
    ).resolves.toMatchObject({ Id: "season-2", Type: "Season" });
  });

  test("a failed request is no answer, not an error", async () => {
    const api = makeApi();
    api.mock.onAny().reply(500);

    await expect(
      lookUpTopShelfPlayItem({ api, userId: "user-1", itemId: "ep-1" }),
    ).resolves.toBeNull();
  });

  // The SDK's axios instance has no timeout: an unreachable server would keep
  // the launch screen black for as long as the OS lets the socket hang.
  test("a server that does not answer is given up on", async () => {
    jest.useFakeTimers();
    const api = makeApi();
    api.mock.onAny().reply(() => new Promise(() => {}));

    const lookup = lookUpTopShelfPlayItem({
      api,
      userId: "user-1",
      itemId: "ep-1",
      timeoutMs: 3000,
    });
    let answer: unknown = "pending";
    void lookup.then((item) => {
      answer = item;
    });

    await jest.advanceTimersByTimeAsync(2999);
    expect(answer).toBe("pending");

    await jest.advanceTimersByTimeAsync(1);
    expect(answer).toBeNull();
  });

  test("nothing is asked when nobody is signed in", async () => {
    const api = makeApi();

    await expect(
      lookUpTopShelfPlayItem({ api: null, userId: undefined, itemId: "ep-1" }),
    ).resolves.toBeNull();
    expect(api.mock.history.get).toHaveLength(0);
  });
});
