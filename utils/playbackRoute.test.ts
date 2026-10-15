import { describe, expect, test } from "bun:test";
import { isPlaybackActive, isPlaybackRoute } from "./playbackRoute";

describe("isPlaybackRoute", () => {
  test("true once the video player is pushed over an item page", () => {
    expect(isPlaybackRoute(["(auth)", "player", "direct-player"])).toBe(true);
  });

  test("true on the music now playing screen", () => {
    expect(isPlaybackRoute(["(auth)", "now-playing"])).toBe(true);
  });

  test("false on movie, series and episode pages", () => {
    expect(
      isPlaybackRoute([
        "(auth)",
        "(tabs)",
        "(home,libraries,search,favorites,watchlists)",
        "items",
        "page",
      ]),
    ).toBe(false);
    expect(
      isPlaybackRoute([
        "(auth)",
        "(tabs)",
        "(home,libraries,search,favorites,watchlists)",
        "series",
        "[id]",
      ]),
    ).toBe(false);
  });
});

describe("isPlaybackActive", () => {
  const itemPage = [
    "(auth)",
    "(tabs)",
    "(home,libraries,search,favorites,watchlists)",
    "items",
    "page",
  ];

  test("the native player is presented without a route, so the item page looks idle", () => {
    expect(isPlaybackRoute(itemPage)).toBe(false);
    expect(isPlaybackActive(itemPage, true)).toBe(true);
  });

  test("the JS player route still counts", () => {
    expect(isPlaybackActive(["(auth)", "player", "direct-player"], false)).toBe(
      true,
    );
  });

  test("an idle item page is not playback", () => {
    expect(isPlaybackActive(itemPage, false)).toBe(false);
  });
});
