import { describe, expect, test } from "bun:test";
import { notificationRoute } from "./notificationRoute";

describe("where a notification takes the app", () => {
  test("a movie opens its page", () => {
    expect(notificationRoute({ type: "Movie", id: "abc" })).toBe(
      "/(auth)/(tabs)/home/items/page?id=abc",
    );
  });

  test("one episode opens its page", () => {
    expect(
      notificationRoute({ type: "Episode", id: "ep1", seriesId: "s1" }),
    ).toBe("/(auth)/(tabs)/home/items/page?id=ep1");
  });

  test("a season's worth of episodes opens the series at that season", () => {
    expect(
      notificationRoute({ type: "Episode", seriesId: "s1", seasonIndex: 2 }),
    ).toBe("/(auth)/(tabs)/home/series/s1?seasonIndex=2");
  });

  test("without a season index it opens the series", () => {
    expect(notificationRoute({ type: "Episode", seriesId: "s1" })).toBe(
      "/(auth)/(tabs)/home/series/s1",
    );
  });

  test("a route sent as it is, is used as it is", () => {
    expect(notificationRoute({ url: "/(auth)/(tabs)/home" })).toBe(
      "/(auth)/(tabs)/home",
    );
  });

  test("a notification about nothing in particular opens nothing", () => {
    expect(notificationRoute(undefined)).toBeNull();
    expect(notificationRoute({})).toBeNull();
    expect(notificationRoute({ title: "hello" })).toBeNull();
    expect(notificationRoute({ type: "Episode" })).toBeNull();
    expect(notificationRoute({ type: "Movie" })).toBeNull();
  });

  test("ignores fields that are not the strings or numbers they should be", () => {
    // A payload is whatever arrives from the push service, so coercing one of these with
    // String() throws where nothing catches it and the notification opens nothing at all.
    const hostile = { toString: null } as unknown as string;

    expect(notificationRoute({ type: hostile, id: "abc" })).toBeNull();

    expect(
      notificationRoute({
        type: "episode",
        seriesId: "series-1",
        seasonIndex: hostile,
      }),
    ).toBe("/(auth)/(tabs)/home/series/series-1");

    expect(
      notificationRoute({ type: "movie", id: 42 as unknown as string }),
    ).toBeNull();
  });

  test("takes a season number whether it arrives as a number or as text", () => {
    expect(
      notificationRoute({
        type: "episode",
        seriesId: "series-1",
        seasonIndex: 2,
      }),
    ).toBe("/(auth)/(tabs)/home/series/series-1?seasonIndex=2");

    expect(
      notificationRoute({
        type: "episode",
        seriesId: "series-1",
        seasonIndex: "2",
      }),
    ).toBe("/(auth)/(tabs)/home/series/series-1?seasonIndex=2");
  });
});
