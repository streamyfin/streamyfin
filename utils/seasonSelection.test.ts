import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { replacementSeason } from "./seasonSelection";

const season = (index: number): BaseItemDto => ({
  Id: `season-${index}`,
  IndexNumber: index,
  Name: `Season ${index}`,
});

describe("replacementSeason", () => {
  test("leaves a remembered season that still exists alone", () => {
    expect(replacementSeason([season(1), season(2)], 2)).toBeUndefined();
  });

  test("has nothing to replace before a season was picked", () => {
    expect(replacementSeason([season(1)], undefined)).toBeUndefined();
    expect(replacementSeason([season(1)], null)).toBeUndefined();
  });

  // The list is undefined while it loads and empty once the series has
  // nothing left; neither says the remembered season is gone.
  test("waits for a season list to choose from", () => {
    expect(replacementSeason(undefined, 1)).toBeUndefined();
    expect(replacementSeason([], 1)).toBeUndefined();
  });

  // #2153: deleting the last downloaded episode of season 1 left the page on
  // "Season 1" with no episodes while season 2 was still downloaded.
  test("moves on to the next season when the remembered one is gone", () => {
    expect(replacementSeason([season(2), season(4)], 1)).toBe(2);
    expect(replacementSeason([season(1), season(4), season(3)], 2)).toBe(3);
  });

  test("falls back to the season before when there is none after", () => {
    expect(replacementSeason([season(1), season(2)], 3)).toBe(2);
  });

  test("season 0 counts as a season to land on", () => {
    expect(replacementSeason([season(0)], 1)).toBe(0);
  });

  test("a season without a number is remembered by its name", () => {
    const extras: BaseItemDto = { Id: "extras", Name: "Extras" };

    expect(replacementSeason([season(1), extras], "Extras")).toBeUndefined();
    expect(replacementSeason([season(1)], "Extras")).toBe(1);
    expect(replacementSeason([extras], 1)).toBe("Extras");
  });
});
