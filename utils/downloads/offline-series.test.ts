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
  test("follows the downloaded episodes offline", () => {
    expect(downloadsKeyPart(true, [])).toBe(0);
    expect(downloadsKeyPart(true, [episode(1), episode(2)])).toBe(2);
  });

  // A changed key online blanked the series page once per finished episode.
  test("stays the same online however many episodes are downloaded", () => {
    expect(downloadsKeyPart(false, [])).toBe(
      downloadsKeyPart(false, [episode(1), episode(2)]),
    );
  });
});
