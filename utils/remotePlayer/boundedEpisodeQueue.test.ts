import { StillWatchingPresets } from "@/constants/StillWatching";
import * as stillWatching from "@/utils/stillWatching";
import { boundedEpisodeQueue, type QueueEpisode } from "./boundedEpisodeQueue";

const TICKS_PER_MINUTE = 600_000_000;

const series = (count: number, minutes: number | null): QueueEpisode[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `e${index}`,
    name: `Episode ${index}`,
    runTimeTicks: minutes === null ? null : minutes * TICKS_PER_MINUTE,
  }));

const ids = (queue: ReturnType<typeof boundedEpisodeQueue>) =>
  queue.items.map((item) => item.id);

const queueOf = (
  episodes: QueueEpisode[],
  overrides: Partial<Parameters<typeof boundedEpisodeQueue>[0]> = {},
) =>
  boundedEpisodeQueue({
    episodes,
    index: 0,
    startPositionTicks: 0,
    autoPlayNextEpisode: true,
    preset: "default",
    ...overrides,
  });

describe("boundedEpisodeQueue", () => {
  afterEach(() => jest.restoreAllMocks());

  test("autoplay off sends the episode alone, without its type", () => {
    const queue = queueOf(series(10, 22), {
      index: 2,
      autoPlayNextEpisode: false,
    });

    // The receiver unfolds a lone typed episode into the rest of the series (proof of 12/11).
    expect(queue.items).toEqual([
      { id: "e2", name: "Episode 2", mediaType: "Video", isFolder: false },
    ]);
    expect(queue.nextUpId).toBe("e3");
  });

  test("the default preset with 22 minute episodes sends five", () => {
    // Three autoplays reach the count at 88 minutes, under the 90: the prompt comes after the fifth.
    expect(ids(queueOf(series(10, 22)))).toEqual([
      "e0",
      "e1",
      "e2",
      "e3",
      "e4",
    ]);
  });

  test("the short preset with one hour episodes sends three", () => {
    expect(ids(queueOf(series(10, 60), { preset: "short" }))).toEqual([
      "e0",
      "e1",
      "e2",
    ]);
  });

  test("one hour episodes under the default preset send four", () => {
    expect(ids(queueOf(series(10, 60)))).toEqual(["e0", "e1", "e2", "e3"]);
  });

  test("the start position shortens the first episode's share", () => {
    const episodes = series(10, 25);

    expect(ids(queueOf(episodes))).toHaveLength(4);
    // Started 15 minutes in, four episodes come to 85 minutes, under the 90: one more plays.
    expect(
      ids(queueOf(episodes, { startPositionTicks: 15 * TICKS_PER_MINUTE })),
    ).toEqual(["e0", "e1", "e2", "e3", "e4"]);
  });

  test("a disabled preset sends the rest of the series", () => {
    const queue = queueOf(series(30, 22), { index: 5, preset: "disabled" });

    expect(ids(queue)).toEqual(
      Array.from({ length: 25 }, (_, index) => `e${index + 5}`),
    );
    expect(queue.nextUpId).toBeNull();
  });

  test("the list never goes past the last episode", () => {
    const queue = queueOf(series(3, 22));

    expect(ids(queue)).toEqual(["e0", "e1", "e2"]);
    expect(queue.nextUpId).toBeNull();
  });

  test("an unknown run time leaves the episode threshold alone", () => {
    const episodes = series(10, 22);
    episodes[1] = { ...episodes[1], runTimeTicks: null };

    // The minutes count as reached once a length is unknown: the episode count alone bounds the list.
    expect(ids(queueOf(episodes))).toEqual(["e0", "e1", "e2", "e3"]);
    expect(ids(queueOf(series(10, null)))).toEqual(["e0", "e1", "e2", "e3"]);
  });

  test("what comes after the list is the next up", () => {
    const queue = queueOf(series(10, 22), { index: 1 });

    expect(ids(queue)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    expect(queue.nextUpId).toBe("e6");
  });

  test("a list of one episode goes without its type", () => {
    const queue = queueOf(series(4, 22), { index: 3 });

    expect(queue.items).toEqual([
      { id: "e3", name: "Episode 3", mediaType: "Video", isFolder: false },
    ]);
    expect(queue.nextUpId).toBeNull();
  });

  test("a list of two or more carries the episode type on each item", () => {
    const { items } = queueOf(series(10, 22));

    expect(items.length).toBeGreaterThan(1);
    expect(items.every((item) => item.type === "Episode")).toBe(true);
  });

  test("the rule asked is the local player's", () => {
    const due = jest
      .spyOn(stillWatching, "isStillWatchingDue")
      .mockImplementation(({ playedCount }) => playedCount === 1);

    expect(ids(queueOf(series(10, 22)))).toEqual(["e0", "e1"]);
    expect(due).toHaveBeenLastCalledWith({
      thresholds: StillWatchingPresets.default,
      playedCount: 1,
      sessionDurationMs: 44 * 60_000,
    });
  });
});
