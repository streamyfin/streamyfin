import { Permission } from "./permissions";
import { discoverRows, loadDiscoverSliders, slidersOf } from "./sliders";
import { type DiscoverSlider, DiscoverSliderType } from "./types";

const slider = (
  type: DiscoverSliderType,
  order: number,
  enabled = true,
): DiscoverSlider =>
  ({ id: order + 1, type, order, enabled, isBuiltIn: true }) as DiscoverSlider;

// The rows Discover draws, on the phone and the TV alike: the first one is
// where the TV puts the focus, so it has to be one that shows.
describe("discoverRows", () => {
  test("keeps the rows the server enables, in its order", () => {
    const rows = discoverRows(
      [
        slider(DiscoverSliderType.POPULAR_TV, 2),
        slider(DiscoverSliderType.TRENDING, 0),
        slider(DiscoverSliderType.UPCOMING_MOVIES, 1, false),
      ],
      Permission.REQUEST,
    );
    expect(rows.map((row) => row.type)).toEqual([
      DiscoverSliderType.TRENDING,
      DiscoverSliderType.POPULAR_TV,
    ]);
  });

  test("leaves out the rows the app does not draw", () => {
    const rows = discoverRows(
      [
        slider(DiscoverSliderType.PLEX_WATCHLIST, 0),
        slider(DiscoverSliderType.TMDB_MOVIE_KEYWORD, 1),
        slider(DiscoverSliderType.TRENDING, 2),
      ],
      Permission.REQUEST,
    );
    expect(rows.map((row) => row.type)).toEqual([DiscoverSliderType.TRENDING]);
  });

  // Seerr's default Discover opens on it, and a plain user may not see it.
  test("shows recently added only to those Seerr shows it to", () => {
    const sliders = [
      slider(DiscoverSliderType.RECENTLY_ADDED, 0),
      slider(DiscoverSliderType.TRENDING, 1),
    ];
    expect(discoverRows(sliders, Permission.REQUEST)[0].type).toBe(
      DiscoverSliderType.TRENDING,
    );
    expect(discoverRows(sliders, Permission.RECENT_VIEW)[0].type).toBe(
      DiscoverSliderType.RECENTLY_ADDED,
    );
  });

  test("has no rows without sliders", () => {
    expect(discoverRows(undefined, Permission.REQUEST)).toEqual([]);
  });

  // The cache is kept on the device for a day, so a body stored before
  // slidersOf read the response still reaches a render (REACT-NATIVE-8V).
  test.each([
    ["a page", "<!DOCTYPE html><html></html>"],
    ["an empty body", ""],
    ["an object", { message: "Not found" }],
  ])("has no rows when what was cached is %s", (_name, cached) => {
    expect(discoverRows(cached, Permission.REQUEST)).toEqual([]);
  });
});

// What the server sends for its sliders, which is not always sliders: a
// proxy's login page or the web app's own page answers 200 too.
describe("slidersOf", () => {
  test("keeps the sliders of a list", () => {
    const sliders = [slider(DiscoverSliderType.TRENDING, 0)];
    expect(slidersOf(sliders)).toEqual(sliders);
  });

  test.each([
    ["a page", "<!DOCTYPE html><html></html>"],
    ["an empty body", ""],
    ["an object", { message: "Not found" }],
    ["nothing", undefined],
    ["null", null],
  ])("has no sliders in %s", (_name, body) => {
    expect(slidersOf(body)).toEqual([]);
  });

  test("leaves out what is not a slider in a list", () => {
    const trending = slider(DiscoverSliderType.TRENDING, 0);
    expect(slidersOf([null, "slider", trending, 3])).toEqual([trending]);
  });
});

describe("loadDiscoverSliders", () => {
  test("asks the server for its sliders", async () => {
    const sliders = [slider(DiscoverSliderType.TRENDING, 0)];
    expect(
      await loadDiscoverSliders({ discoverSettings: async () => sliders }),
    ).toEqual(sliders);
  });

  // The query lives on after the Seerr client is gone, signed out of from
  // the settings while a retry waits. Undefined is the one value React Query
  // refuses, as a failure reported under the query's name
  // (REACT-NATIVE-1N).
  test("has no sliders, rather than undefined, without a client", async () => {
    expect(await loadDiscoverSliders(undefined)).toEqual([]);
  });
});
