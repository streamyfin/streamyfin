import i18next from "i18next";
import { episodeNumberLabel, episodeSubtitle } from "@/utils/episodeLabel";

beforeAll(() =>
  i18next.init({
    lng: "fr",
    resources: {
      fr: {
        translation: {
          item_card: { episode_number: "Épisode {{episode_number}}" },
          seerr: { season_number: "Saison {{season_number}}" },
        },
      },
    },
  }),
);

// The players and the episode header wrote "Episode" in English whatever the
// app's language, next to the launcher tile's "Épisode 3".
test("numbers an episode in the app's language", () => {
  expect(episodeNumberLabel(i18next.t, 3)).toBe("Épisode 3");
});

test("the line above an episode's title names its series, season and number", () => {
  expect(
    episodeSubtitle(i18next.t, {
      SeriesName: "Doctor Who",
      SeasonName: "Saison 2",
      ParentIndexNumber: 2,
      IndexNumber: 3,
    }),
  ).toBe("Doctor Who - Saison 2 Épisode 3");
});

// An offline episode can come without a season name: it read "undefined".
test("a season without a name is named from its number", () => {
  expect(
    episodeSubtitle(i18next.t, {
      SeriesName: "Doctor Who",
      ParentIndexNumber: 2,
      IndexNumber: 3,
    }),
  ).toBe("Doctor Who - Saison 2 Épisode 3");
});
