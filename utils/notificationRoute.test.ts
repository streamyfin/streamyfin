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
});
