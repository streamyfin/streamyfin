import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  isPlainTap,
  notificationRoute,
  responseRoute,
} from "./notificationRoute";

describe("where a notification takes the app", () => {
  test("generated destinations resolve against the actual app routes", () => {
    // A bun script of its own: it swaps out expo-router's native entrypoint
    // to parse the real app routes, which this test environment cannot load.
    const result = spawnSync("bun", [
      "run",
      join(__dirname, "../test-utils/notificationRoutes.ts"),
    ]);
    expect(result.stderr.toString()).toBe("");
    expect(result.status).toBe(0);
  });
  test("a movie opens its page", () => {
    expect(notificationRoute({ type: "Movie", id: "abc" })).toBe(
      "/(auth)/(tabs)/(home)/items/page?id=abc",
    );
  });

  test("one episode opens its page", () => {
    expect(
      notificationRoute({ type: "Episode", id: "ep1", seriesId: "s1" }),
    ).toBe("/(auth)/(tabs)/(home)/items/page?id=ep1");
  });

  test("a season's worth of episodes opens the series at that season", () => {
    expect(
      notificationRoute({ type: "Episode", seriesId: "s1", seasonIndex: 2 }),
    ).toBe("/(auth)/(tabs)/(home)/series/s1?seasonIndex=2");
  });

  test("without a season index it opens the series", () => {
    expect(notificationRoute({ type: "Episode", seriesId: "s1" })).toBe(
      "/(auth)/(tabs)/(home)/series/s1",
    );
  });

  test("a route sent as it is, is used as it is", () => {
    expect(notificationRoute({ url: "/(auth)/(tabs)/(home)" })).toBe(
      "/(auth)/(tabs)/(home)",
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
    ).toBe("/(auth)/(tabs)/(home)/series/series-1");

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
    ).toBe("/(auth)/(tabs)/(home)/series/series-1?seasonIndex=2");

    expect(
      notificationRoute({
        type: "episode",
        seriesId: "series-1",
        seasonIndex: "2",
      }),
    ).toBe("/(auth)/(tabs)/(home)/series/series-1?seasonIndex=2");
  });
});

// The person answers a notification by tapping it or one of its buttons. The plain tap's
// identifier comes from expo-notifications, which a TV build leaves out, so it is passed in.
describe("where an answer to a notification takes the app", () => {
  const PLAIN_TAP = "expo.modules.notifications.actions.DEFAULT";
  const answer = (actionIdentifier: string) => ({
    actionIdentifier,
    notification: {
      request: { content: { data: { type: "Movie", id: "abc" } } },
    },
  });

  test("a plain tap opens what the notification is about", () => {
    expect(isPlainTap(answer(PLAIN_TAP), PLAIN_TAP)).toBe(true);
    expect(responseRoute(answer(PLAIN_TAP), PLAIN_TAP)).toBe(
      "/(auth)/(tabs)/(home)/items/page?id=abc",
    );
  });

  // Pausing everything or turning a show off happens where the app is: the button is
  // carried out by useNotificationActions, and opening the movie would take the person away.
  test("a button opens nothing", () => {
    expect(isPlainTap(answer("pause"), PLAIN_TAP)).toBe(false);
    expect(responseRoute(answer("pause"), PLAIN_TAP)).toBeNull();
    expect(responseRoute(answer("muteShow"), PLAIN_TAP)).toBeNull();
  });

  // The app was not opened by a notification.
  test("no answer opens nothing", () => {
    expect(isPlainTap(null, PLAIN_TAP)).toBe(false);
    expect(responseRoute(null, PLAIN_TAP)).toBeNull();
  });
});
