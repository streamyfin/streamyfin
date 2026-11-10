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

// An episode with no number: the sentence's template, or "undefined", showed.
test("an episode without a number gets no number label", () => {
  expect(episodeNumberLabel(i18next.t, undefined)).toBe("");
  expect(episodeNumberLabel(i18next.t, null)).toBe("");
  expect(
    episodeSubtitle(i18next.t, {
      SeriesName: "Doctor Who",
      SeasonName: "Saison 2",
      ParentIndexNumber: 2,
    }),
  ).toBe("Doctor Who - Saison 2");
});

test("an episode without a season says no season", () => {
  expect(
    episodeSubtitle(i18next.t, { SeriesName: "Doctor Who", IndexNumber: 3 }),
  ).toBe("Doctor Who - Épisode 3");
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

// An episode without its series' name read "undefined - Saison 2 Épisode 3".
test("an episode without a series name leaves the series out", () => {
  expect(
    episodeSubtitle(i18next.t, {
      SeasonName: "Saison 2",
      ParentIndexNumber: 2,
      IndexNumber: 3,
    }),
  ).toBe("Saison 2 Épisode 3");
  expect(episodeSubtitle(i18next.t, {})).toBe("");
});
