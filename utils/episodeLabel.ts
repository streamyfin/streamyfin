import type { TFunction } from "i18next";

/** "Episode N" in the app's language, nothing for an episode without a number. */
export const episodeNumberLabel = (
  t: TFunction,
  index: number | null | undefined,
): string =>
  index === null || index === undefined
    ? ""
    : t("item_card.episode_number", { episode_number: index });
