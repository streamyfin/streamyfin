import { resolvePlayState } from "./playState";

const MINUTE = 60 * 10_000_000;
const movie = { Type: "Movie" as const, RunTimeTicks: 100 * MINUTE };
const at = (share: number) => Math.round(movie.RunTimeTicks * share);

// Mirrors Jellyfin's UserDataManager.UpdatePlayState with its default
// thresholds, so progress the server never sees lands as it would there.
describe("resolvePlayState", () => {
  test("keeps a position between 5% and 90% to resume from", () => {
    expect(resolvePlayState(movie, at(0.5))).toEqual({
      positionTicks: at(0.5),
      playedToCompletion: false,
    });
  });

  test("drops a position under 5% without marking anything", () => {
    expect(resolvePlayState(movie, at(0.04))).toEqual({
      positionTicks: 0,
      playedToCompletion: false,
    });
  });

  // CodeRabbit on #2328: another app's 95% left the server with an unplayed
  // item resuming near its end, while the download counted it as played.
  test("counts a position past 90% as played", () => {
    expect(resolvePlayState(movie, at(0.95))).toEqual({
      positionTicks: 0,
      playedToCompletion: true,
    });
  });

  test("counts the last second as played", () => {
    expect(
      resolvePlayState(
        { Type: "Movie", RunTimeTicks: 10 * MINUTE },
        10 * MINUTE - 5_000_000,
      ).playedToCompletion,
    ).toBe(true);
  });

  test("counts an item shorter than five minutes as played once past 5%", () => {
    expect(
      resolvePlayState(
        { Type: "Episode", RunTimeTicks: 4 * MINUTE },
        2 * MINUTE,
      ),
    ).toEqual({ positionTicks: 0, playedToCompletion: true });
  });

  test("counts an item with no runtime as played", () => {
    expect(resolvePlayState({ Type: "Video" }, 3 * MINUTE)).toEqual({
      positionTicks: 0,
      playedToCompletion: true,
    });
  });

  test("judges an audiobook by the minutes at either end", () => {
    const book = { Type: "AudioBook" as const, RunTimeTicks: 600 * MINUTE };

    expect(resolvePlayState(book, 4 * MINUTE).positionTicks).toBe(0);
    expect(resolvePlayState(book, 300 * MINUTE).positionTicks).toBe(
      300 * MINUTE,
    );
    expect(resolvePlayState(book, 596 * MINUTE).playedToCompletion).toBe(true);
  });
});
