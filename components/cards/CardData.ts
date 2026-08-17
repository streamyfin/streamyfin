import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemProgressPercentage } from "@/components/common/ProgressBar";
import {
  GLASS_CARD_ROW_VERTICAL_PADDING,
  type GlassCardRowItem,
  glassCardRowHeight,
} from "@/modules/glass-card-row";
import { getPortraitImageUrl } from "@/utils/jellyfin/image/getPortraitImageUrl";
import { getWideImageUrl } from "@/utils/jellyfin/image/getWideImageUrl";

/**
 * One card, in the shape both renderers take: the native view decodes exactly
 * this, and the JS fallback renders exactly this. See docs/native-card-row.md.
 */
export type CardData = GlassCardRowItem;

export type CardKind = "wide" | "portrait" | "episode";

/**
 * Card geometry — the single source of truth for every platform. The values
 * ride along in the payload, so a native view only draws what it is told and
 * never carries its own constants, and JS reserves the matching height.
 *
 * Anything beyond size is a hint: how a card is *styled* is each native
 * implementation's business.
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
    verticalPadding: GLASS_CARD_ROW_VERTICAL_PADDING,
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
    verticalPadding: GLASS_CARD_ROW_VERTICAL_PADDING,
  },
  // The episode carousel's stills, a little narrower than the home rows.
  episode: {
    cardWidth: 200,
    aspectRatio: 16 / 9,
    cornerRadius: 14,
    spacing: 10,
    contentInset: 16,
    frostFraction: 0.45,
    verticalPadding: GLASS_CARD_ROW_VERTICAL_PADDING,
  },
};

/** Height a row of this kind occupies, shadow padding included. */
export const cardRowHeight = (kind: CardKind) =>
  glassCardRowHeight(
    CARD_LAYOUTS[kind].cardWidth,
    CARD_LAYOUTS[kind].aspectRatio,
  );

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
 * rules live, so every renderer on every platform says the same thing.
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

    // Default fields are left out rather than sent as 0/false/null: the whole
    // list is serialised on every change, and a library page is mostly
    // defaults. The native decoder fills them in.
    return [
      {
        id: item.Id,
        title: item.Name ?? "",
        ...(subtitle ? { subtitle } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(progress > 0 ? { progress } : {}),
        ...(unwatched ? { unwatched } : {}),
        ...(unplayedCount > 0 ? { unplayedCount } : {}),
        ...(dimmed ? { dimmed } : {}),
      },
    ];
  });
}
