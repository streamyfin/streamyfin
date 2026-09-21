import { describe, expect, test } from "bun:test";
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

  test("give each network and studio something to draw", () => {
    for (const network of networks) {
      expect(network.image, `network ${network.id} has no image`).toBeTruthy();
      expect(network.name, `network ${network.id} has no name`).toBeTruthy();
    }

    for (const studio of studios) {
      expect(studio.image, `studio ${studio.id} has no image`).toBeTruthy();
    }
  });

  // Each genre is drawn as a gradient between two colours, so a row with one
  // colour, or three, breaks the slider rather than looking odd.
  test("colour every genre with a pair", () => {
    for (const [genre, pair] of Object.entries(genreColorMap)) {
      expect(pair, `genre ${genre}`).toHaveLength(2);
    }

    for (const [tone, pair] of Object.entries(colorTones)) {
      expect(pair, `tone ${tone}`).toHaveLength(2);
    }
  });

  test("keep the two constants the app reads beside them", () => {
    expect(ANIME_KEYWORD_ID).toBe(210024);
    expect(COMPANY_LOGO_IMAGE_FILTER).toBe(
      "w780_filter(duotone,ffffff,bababa)",
    );
  });
});
