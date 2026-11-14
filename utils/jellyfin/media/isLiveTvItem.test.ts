import { isLiveTvItem } from "./isLiveTvItem";

describe("isLiveTvItem", () => {
  test("a channel plays live", () => {
    expect(isLiveTvItem({ Type: "TvChannel" })).toBe(true);
  });

  // Whatever its air time, a program plays the channel it belongs to, as it
  // is on air now.
  test("a program plays its channel, so it is live too", () => {
    expect(isLiveTvItem({ Type: "Program", ChannelId: "channel-1" })).toBe(
      true,
    );
  });

  // A recording is a file with a start and an end, even one of a live match.
  test("a recording, a movie and an episode are not", () => {
    expect(isLiveTvItem({ Type: "Recording" })).toBe(false);
    expect(isLiveTvItem({ Type: "Movie", IsLive: true })).toBe(false);
    expect(isLiveTvItem({ Type: "Episode" })).toBe(false);
  });

  test("no item is not live", () => {
    expect(isLiveTvItem(undefined)).toBe(false);
    expect(isLiveTvItem(null)).toBe(false);
  });
});
