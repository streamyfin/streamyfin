import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemProgressPercentage } from "@/components/common/ProgressBar";
import { getPortraitImageUrl } from "@/utils/jellyfin/image/getPortraitImageUrl";
import { getWideImageUrl } from "@/utils/jellyfin/image/getWideImageUrl";

/** One card. Everything is prebuilt here; the card view is presentational. */
export type CardData = {
  /** Item id, handed back by the press handlers. */
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  /** Watch progress in 0...1. Draws the progress bar when > 0. */
  progress?: number;
  /** Unwatched movie or episode — draws the accent dot. */
  unwatched?: boolean;
  /** Episodes left on a series/box set — draws the count badge when > 0. */
  unplayedCount?: number;
  /** Faded back because another card in the row is the current one. */
  dimmed?: boolean;
};

export type CardKind = "wide" | "portrait" | "episode";

/** Breathing room above/below the cards so their shadow isn't clipped. */
export const CARD_VERTICAL_PADDING = 6;

/**
 * Card geometry — the single source of truth for every kind of row, so a card
 * and the space reserved for it can never drift apart.
 */
export const CARD_LAYOUTS: Record<
  CardKind,
  {
    cardWidth: number;
    aspectRatio: number;
    cornerRadius: number;
    spacing: number;
    contentInset: number;
    frostFraction: number;
    verticalPadding: number;
  }
> = {
  // Landscape stills.
  wide: {
    cardWidth: 220,
    aspectRatio: 16 / 9,
    cornerRadius: 14,
    spacing: 10,
    contentInset: 16,
    frostFraction: 0.45,
    verticalPadding: CARD_VERTICAL_PADDING,
  },
  // Portrait posters. The title sits on the card, and a shallower frost covers
  // less of a tall poster.
  portrait: {
    cardWidth: 132,
    aspectRatio: 10 / 15,
    cornerRadius: 12,
    spacing: 10,
    contentInset: 16,
    frostFraction: 0.33,
    verticalPadding: CARD_VERTICAL_PADDING,
  },
  // The episode carousel's stills, a little narrower than the home rows.
  episode: {
    cardWidth: 200,
    aspectRatio: 16 / 9,
    cornerRadius: 14,
    spacing: 10,
    contentInset: 16,
    frostFraction: 0.45,
    verticalPadding: CARD_VERTICAL_PADDING,
  },
};

/** Height a row of this kind occupies, shadow padding included. */
export const cardRowHeight = (kind: CardKind) => {
  const { cardWidth, aspectRatio, verticalPadding } = CARD_LAYOUTS[kind];
  return cardWidth / aspectRatio + verticalPadding * 2;
};

const isMovieOrEpisode = (item: BaseItemDto) =>
  item.Type === "Movie" || item.Type === "Episode";
const isAggregate = (item: BaseItemDto) =>
  item.Type === "Series" || item.Type === "BoxSet";

type BuildOptions = {
  api?: Api | null;
  kind: CardKind;
  /** Prefer the episode's own still over the series thumbnail. */
  useEpisodePoster?: boolean;
  /** Item to keep at full opacity; every other card is faded back. */
  selectedId?: string | null;
};

/**
 * `BaseItemDto` → card. The one place the labels, image selection and badge
 * rules live, so every row says the same thing about the same item.
 */
export function buildItemCards(
  items: BaseItemDto[],
  { api, kind, useEpisodePoster = false, selectedId }: BuildOptions,
): CardData[] {
  if (!api) return [];

  return items.flatMap((item) => {
    if (!item.Id) return [];

    // The two lines ItemCardText shows.
    const subtitle =
      item.Type === "Episode"
        ? `S${item.ParentIndexNumber}:E${item.IndexNumber} - ${item.SeriesName ?? ""}`
        : item.ProductionYear
          ? String(item.ProductionYear)
          : null;

    const unplayed = item.UserData?.UnplayedItemCount ?? 0;
    const imageUrl =
      kind === "portrait"
        ? getPortraitImageUrl({ api, item })
        : getWideImageUrl({ api, item, useEpisodePoster });

    const progress = getItemProgressPercentage(item) / 100;
    // Strict === false: items without UserData (unknown state) get no dot.
    const unwatched = isMovieOrEpisode(item) && item.UserData?.Played === false;
    const unplayedCount =
      isAggregate(item) && !item.UserData?.Played ? unplayed : 0;
    const dimmed = selectedId != null && item.Id !== selectedId;

    return [
      {
        id: item.Id,
        title: item.Name ?? "",
        subtitle,
        imageUrl,
        progress,
        unwatched,
        unplayedCount,
        dimmed,
      },
    ];
  });
}
