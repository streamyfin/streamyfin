import i18next from "i18next";
import { episodeNumberLabel } from "@/utils/episodeLabel";

beforeAll(() =>
  i18next.init({
    lng: "fr",
    resources: {
      fr: {
        translation: {
          item_card: { episode_number: "Épisode {{episode_number}}" },
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

// An episode with no number: the sentence's template, or "undefined", showed.
test("an episode without a number gets no number label", () => {
  expect(episodeNumberLabel(i18next.t, undefined)).toBe("");
  expect(episodeNumberLabel(i18next.t, null)).toBe("");
});
