import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTopShelfItemPath } from "./itemPath";
import { buildTVDiscoveryPayload } from "./payload";

const HOME = "/(auth)/(tabs)/(home)";

const api = { basePath: "https://jellyfin.example" } as Api;

/**
 * Follows a tile's link the way the app does: the query string the payload
 * builder wrote is what `app/topshelf/item.tsx` gets back as search params.
 */
const landingFor = (item: BaseItemDto): string => {
  const payload = buildTVDiscoveryPayload({
    api,
    sections: [{ title: "Continue and Next Up", items: [item] }],
  });
  const route = payload?.sections[0]?.items[0]?.route;
  if (!route) throw new Error("the item did not make it into the payload");

  const query = route.slice(route.indexOf("?") + 1);
  const params = Object.fromEntries(
    query.split("&").map((pair) => {
      const [key, value = ""] = pair.split("=");
      return [key, decodeURIComponent(value)];
    }),
  );
  if (!params.id) throw new Error("the link carries no id");

  return getTopShelfItemPath({ ...params, id: params.id });
};

// The link is built in payload.ts and read in itemPath.ts, and each side has
// its own tests against hand-written strings. These go through both, so a
// parameter renamed on one side only fails here instead of silently sending
// every season tile to the item page.
describe("a tile's link lands where the item it was built from belongs", () => {
  test("a season lands on its series with that season selected", () => {
    expect(
      landingFor({
        Id: "season-2",
        Name: "Season 2",
        Type: "Season",
        SeriesId: "series-1",
        IndexNumber: 2,
      }),
    ).toBe(`${HOME}/series/series-1?seasonIndex=2`);
  });

  test("specials land on season 0", () => {
    expect(
      landingFor({
        Id: "season-0",
        Name: "Specials",
        Type: "Season",
        SeriesId: "series-1",
        IndexNumber: 0,
      }),
    ).toBe(`${HOME}/series/series-1?seasonIndex=0`);
  });

  test("a series lands on the series page", () => {
    expect(
      landingFor({ Id: "series-1", Name: "Severance", Type: "Series" }),
    ).toBe(`${HOME}/series/series-1`);
  });

  test("an episode lands on its own page", () => {
    expect(landingFor({ Id: "ep-1", Name: "Pilot", Type: "Episode" })).toBe(
      `${HOME}/items/page?id=ep-1`,
    );
  });

  test("a season the server sent without its series lands on the item page", () => {
    expect(
      landingFor({ Id: "season-2", Name: "Season 2", Type: "Season" }),
    ).toBe(`${HOME}/items/page?id=season-2`);
  });
});

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

// The link arrives from outside the app, and the router decodes its values
// before they get here. Put back into a path as they are, a value can carry a
// second parameter or a path of its own into the screen it opens.
describe("getTopShelfItemPath: a link that was not written by the payload builder", () => {
  test("a season index that is not a number is dropped, not passed on", () => {
    expect(
      getTopShelfItemPath({
        id: "season-2",
        type: "Season",
        seriesId: "series-1",
        seasonIndex: "2&offline=true",
      }),
    ).toBe(`${HOME}/series/series-1`);
  });

  test("a series id cannot name another route or add a parameter", () => {
    expect(
      getTopShelfItemPath({
        id: "season-2",
        type: "Season",
        seriesId: "../settings?offline=true",
        seasonIndex: "2",
      }),
    ).toBe(`${HOME}/series/..%2Fsettings%3Foffline%3Dtrue?seasonIndex=2`);
  });

  test("an id cannot name another route or add a parameter", () => {
    expect(getTopShelfItemPath({ id: "a/b?c=d", type: "Series" })).toBe(
      `${HOME}/series/a%2Fb%3Fc%3Dd`,
    );
    expect(getTopShelfItemPath({ id: "x&offline=true" })).toBe(
      `${HOME}/items/page?id=x%26offline%3Dtrue`,
    );
  });
});
