import {
  ANIME_KEYWORD_ID,
  COMPANY_LOGO_IMAGE_FILTER,
  colorTones,
  genreColorMap,
  networks,
  studios,
} from "./data";

describe("the discover tables", () => {
  // Copied from the web interface rather than served by the API, so nothing
  // upstream would tell us if a row went missing in the copy. The counts are
  // what the pinned version carries; the first copy of this took its rows from
  // the submodule and lost A24 that way.
  test("carry every row the web interface offers", () => {
    expect(networks).toHaveLength(22);
    expect(studios).toHaveLength(11);
    expect(Object.keys(genreColorMap)).toHaveLength(28);
  });

  test("address each network and studio by a distinct id", () => {
    expect(new Set(networks.map((n) => n.id)).size).toBe(networks.length);
    expect(new Set(studios.map((s) => s.id)).size).toBe(studios.length);
  });

  // Jest's expect takes no message: each check lists the rows that fail it.
  test("give each network and studio something to draw", () => {
    expect(
      networks.filter((n) => !n.image || !n.name).map((n) => n.id),
    ).toEqual([]);
    expect(studios.filter((s) => !s.image).map((s) => s.id)).toEqual([]);
  });

  // Each genre is drawn as a gradient between two colours, so a row with one
  // colour, or three, breaks the slider rather than looking odd.
  test("colour every genre with a pair", () => {
    const notPairs = (table: Record<string, unknown[]>) =>
      Object.entries(table)
        .filter(([, pair]) => pair.length !== 2)
        .map(([name]) => name);
    expect(notPairs(genreColorMap)).toEqual([]);
    expect(notPairs(colorTones)).toEqual([]);
  });

  test("keep the two constants the app reads beside them", () => {
    expect(ANIME_KEYWORD_ID).toBe(210024);
    expect(COMPANY_LOGO_IMAGE_FILTER).toBe(
      "w780_filter(duotone,ffffff,bababa)",
    );
  });
});
