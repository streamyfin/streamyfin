import i18next from "i18next";
import type { DownloadedItem } from "@/providers/Downloads/types";
import { buildOfflineSeasons, downloadsKeyPart } from "./offline-series";

beforeAll(() =>
  i18next.init({
    lng: "en",
    resources: {
      en: {
        translation: { seerr: { season_number: "Season {{season_number}}" } },
      },
    },
  }),
);

const episode = (season: number, seasonName?: string): DownloadedItem =>
  ({
    item: {
      Id: `episode-${season}`,
      Type: "Episode",
      SeriesId: "series-1",
      ParentIndexNumber: season,
      IndexNumber: 1,
      SeasonName: seasonName,
    },
  }) as DownloadedItem;

describe("buildOfflineSeasons", () => {
  // The pages name a season at render time, in the app's language: a name
  // written here would stay in the seasons query's cache across a language
  // change, the offline query never refetching.
  test("leaves a season the server gave no name without one", () => {
    expect(buildOfflineSeasons([episode(2)], "series-1")).toEqual([
      { Id: "offline-season-2", IndexNumber: 2, SeriesId: "series-1" },
    ]);
  });

  test("keeps the name the server gave", () => {
    expect(
      buildOfflineSeasons([episode(1, "Saison 1")], "series-1")[0].Name,
    ).toBe("Saison 1");
  });
});

describe("downloadsKeyPart", () => {
  // A delete and a finished download in one refresh leave the item count
  // unchanged, so a count-based key kept the deleted episode on screen.
  test("follows the downloads refresh offline", () => {
    expect(downloadsKeyPart(true, 3)).toBe(3);
    expect(downloadsKeyPart(true, 4)).not.toBe(downloadsKeyPart(true, 3));
  });

  // A changed key online blanked the series page once per finished episode.
  test("stays the same online however often the downloads refresh", () => {
    expect(downloadsKeyPart(false, 0)).toBe(downloadsKeyPart(false, 5));
  });
});
