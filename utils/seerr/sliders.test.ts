import { Permission } from "./permissions";
import { discoverRows } from "./sliders";
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
});
