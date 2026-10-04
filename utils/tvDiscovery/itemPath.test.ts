import { getTopShelfItemPath } from "./itemPath";

const HOME = "/(auth)/(tabs)/(home)";

describe("getTopShelfItemPath: where a home screen tile lands in the app", () => {
  test("an episode or a movie opens its own page", () => {
    expect(getTopShelfItemPath({ id: "ep-1", type: "Episode" })).toBe(
      `${HOME}/items/page?id=ep-1`,
    );
    expect(getTopShelfItemPath({ id: "movie-1", type: "Movie" })).toBe(
      `${HOME}/items/page?id=movie-1`,
    );
  });

  test("a series opens the series page", () => {
    expect(getTopShelfItemPath({ id: "series-1", type: "Series" })).toBe(
      `${HOME}/series/series-1`,
    );
  });

  // A season on the item page is a page with nothing to play on it. The app
  // shows a season as its series with that season selected, so the tile does
  // the same as a season card inside the app.
  test("a season opens its series on that season", () => {
    expect(
      getTopShelfItemPath({
        id: "season-2",
        type: "Season",
        seriesId: "series-1",
        seasonIndex: "2",
      }),
    ).toBe(`${HOME}/series/series-1?seasonIndex=2`);
  });

  test("specials are season 0, not a missing season", () => {
    expect(
      getTopShelfItemPath({
        id: "season-0",
        type: "Season",
        seriesId: "series-1",
        seasonIndex: "0",
      }),
    ).toBe(`${HOME}/series/series-1?seasonIndex=0`);
  });

  test("a season without an index opens the series where the user left off", () => {
    expect(
      getTopShelfItemPath({
        id: "season-x",
        type: "Season",
        seriesId: "series-1",
      }),
    ).toBe(`${HOME}/series/series-1`);
  });

  // A tile published by a build that did not send the series yet: the item
  // page is the only place the id alone can lead to.
  test("a season from an older payload falls back to the item page", () => {
    expect(getTopShelfItemPath({ id: "season-2", type: "Season" })).toBe(
      `${HOME}/items/page?id=season-2`,
    );
  });

  test("a link with no type opens the item page", () => {
    expect(getTopShelfItemPath({ id: "item-1" })).toBe(
      `${HOME}/items/page?id=item-1`,
    );
  });
});
