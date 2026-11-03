import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { seerrSeriesPageParams } from "./seriesRequest";
import { MediaType } from "./types";

const series: BaseItemDto = {
  Id: "series-1",
  Type: "Series",
  Name: "South Park",
  ProductionYear: 1997,
  ProviderIds: { Tmdb: "2190", Tvdb: "75897" },
};

describe("seerrSeriesPageParams", () => {
  test("opens the series on Seerr by its TMDB id", () => {
    expect(
      seerrSeriesPageParams({ item: series, posterSrc: "https://p/1.jpg" }),
    ).toEqual({
      id: "2190",
      mediaType: MediaType.TV,
      mediaTitle: "South Park",
      releaseYear: "1997",
      posterSrc: "https://p/1.jpg",
      autoRequest: "true",
    });
  });

  test("offers nothing for a series Jellyfin never matched on TMDB", () => {
    expect(
      seerrSeriesPageParams({
        item: { ...series, ProviderIds: { Tvdb: "75897" } },
        posterSrc: "",
      }),
    ).toBeUndefined();
    expect(
      seerrSeriesPageParams({
        item: { ...series, ProviderIds: { Tmdb: " " } },
        posterSrc: "",
      }),
    ).toBeUndefined();
  });

  // A hand-edited or broken id would open a Seerr page that 404s.
  test("offers nothing for a TMDB id that is not a number", () => {
    expect(
      seerrSeriesPageParams({
        item: { ...series, ProviderIds: { Tmdb: "tt0121955" } },
        posterSrc: "",
      }),
    ).toBeUndefined();
  });

  // Movies are requested whole from Discover; this is for missing seasons.
  test("offers nothing for an item that is not a series", () => {
    expect(
      seerrSeriesPageParams({
        item: { ...series, Type: "Movie" },
        posterSrc: "",
      }),
    ).toBeUndefined();
  });

  test("keeps a series with no year", () => {
    expect(
      seerrSeriesPageParams({
        item: { ...series, ProductionYear: undefined },
        posterSrc: "",
      })?.releaseYear,
    ).toBe("");
  });
});
