import {
  getPlayingRunTimeTicks,
  isAlternateVersion,
} from "./mediaSourceVersion";

const versions = [{ Id: "primary" }, { Id: "alt" }];

describe("isAlternateVersion", () => {
  test("a grouped version other than the primary", () => {
    expect(isAlternateVersion("primary", versions, "alt")).toBe(true);
    expect(isAlternateVersion("primary", versions, "primary")).toBe(false);
  });

  test("plugin or channel streams that do not list the primary", () => {
    // Several sources, none of them the item itself: not versions, and their
    // IDs name no item.
    const streams = [{ Id: "stream-a" }, { Id: "stream-b" }];
    expect(isAlternateVersion("primary", streams, "stream-a")).toBe(false);
  });

  test("a single source whose ID is not the item's", () => {
    expect(isAlternateVersion("channel", [{ Id: "live" }], "live")).toBe(false);
  });
});

describe("getPlayingRunTimeTicks", () => {
  // The item's RunTimeTicks is its primary version's. A longer cut measured
  // against it ended the seek bar early and started the next-episode
  // countdown with part of the episode still to play.
  test("uses the playing source's runtime", () => {
    expect(
      getPlayingRunTimeTicks({ RunTimeTicks: 100 }, { RunTimeTicks: 150 }),
    ).toBe(150);
  });

  test("falls back to the item's runtime", () => {
    expect(getPlayingRunTimeTicks({ RunTimeTicks: 100 }, undefined)).toBe(100);
    expect(getPlayingRunTimeTicks({ RunTimeTicks: 100 }, {})).toBe(100);
    // A source not probed yet reports 0, which is not a runtime.
    expect(
      getPlayingRunTimeTicks({ RunTimeTicks: 100 }, { RunTimeTicks: 0 }),
    ).toBe(100);
    expect(getPlayingRunTimeTicks({}, null)).toBe(0);
  });
});
