import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemProgressPercentage } from "@/components/common/ProgressBar";
import {
  CARD_IMAGE_WIDTH_STEP_PX,
  MAX_CARD_IMAGE_WIDTH_PX,
} from "@/constants/Images";
import { getPortraitImageUrl } from "@/utils/jellyfin/image/getPortraitImageUrl";
import { getWideImageUrl } from "@/utils/jellyfin/image/getWideImageUrl";
import { toImagePixels } from "@/utils/jellyfin/image/imagePixels";
import { isLiveBroadcast } from "@/utils/jellyfin/media/isLiveBroadcast";

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
  /**
   * Text for the corner pill when it isn't an unplayed count — the number of
   * downloaded episodes, say. Takes precedence over `unplayedCount`.
   */
  badgeLabel?: string | null;
  /**
   * A third line, after the subtitle — a runtime, a file size. Only a string
   * derivable from the item belongs here; anything that has to subscribe to
   * something is a slot the screen fills in.
   */
  detail?: string | null;
  /** A Live TV program broadcast live — draws the LIVE pill in the corner. */
  live?: boolean;
  /** Faded back because another card in the row is the current one. */
  dimmed?: boolean;
  /**
   * Overrides the kind's aspect ratio, for items whose artwork isn't the shape
   * the container expects — an album among posters, say.
   */
  aspectRatio?: number;
};

export type CardKind = "wide" | "portrait" | "rowWide";

/**
 * Per-item extras a screen hangs on a card. The card never knows what they
 * mean — it only reserves the space. Memoize these at the call site: a new
 * function identity re-renders every cell in the list.
 */
export type CardSlots = {
  /** Layer over the artwork: a play glyph, a status icon. */
  overlay?: (card: CardData) => React.ReactNode;
  /** The right-hand end of a list row: a download button, a menu. */
  trailing?: (card: CardData) => React.ReactNode;
  /** Below the metadata: an overview, a file size. */
  footer?: (card: CardData) => React.ReactNode;
};

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
    cardWidth: 200,
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
    cardWidth: 118,
    aspectRatio: 10 / 15,
    cornerRadius: 12,
    spacing: 10,
    contentInset: 16,
    frostFraction: 0.33,
    verticalPadding: CARD_VERTICAL_PADDING,
  },
  // The thumbnail on a list row, where the text sits beside the artwork
  // rather than on it — so no frost band.
  rowWide: {
    cardWidth: 128,
    aspectRatio: 16 / 9,
    cornerRadius: 8,
    spacing: 12,
    contentInset: 16,
    frostFraction: 0,
    verticalPadding: 0,
  },
};

/** Height a row of this kind occupies, shadow padding included. */
export const cardRowHeight = (kind: CardKind) => {
  const { cardWidth, aspectRatio, verticalPadding } = CARD_LAYOUTS[kind];
  return cardWidth / aspectRatio + verticalPadding * 2;
};

/**
 * Pixel width to request artwork at for a card this many layout points wide:
 * what the screen draws, rounded up to the next step so cards of nearly the
 * same width share one image.
 */
const cardImageWidth = (cardWidth: number) =>
  Math.min(
    Math.ceil(toImagePixels(cardWidth) / CARD_IMAGE_WIDTH_STEP_PX) *
      CARD_IMAGE_WIDTH_STEP_PX,
    MAX_CARD_IMAGE_WIDTH_PX,
  );

/**
 * The second line under a title: which episode this is, or when it came out.
 * Exported so anything building cards outside `buildItemCards` — the offline
 * downloads, say — labels an item the same way.
 *
 * @param episodeLabel Text shown after an episode number. Defaults to its series.
 */
export const cardSubtitle = (
  item: BaseItemDto,
  episodeLabel?: string,
): string | null => {
  if (item.Type === "Episode") {
    const episodeNumber = `S${item.ParentIndexNumber}:E${item.IndexNumber}`;
    if (episodeLabel === undefined) {
      return `${episodeNumber} - ${item.SeriesName ?? ""}`;
    }

    const hasEpisodeNumber =
      item.ParentIndexNumber != null && item.IndexNumber != null;
    return [hasEpisodeNumber ? episodeNumber : null, episodeLabel]
      .filter(Boolean)
      .join(" - ");
  }
  return item.ProductionYear ? String(item.ProductionYear) : null;
};

const isMovieOrEpisode = (item: BaseItemDto) =>
  item.Type === "Movie" || item.Type === "Episode";
const isAggregate = (item: BaseItemDto) =>
  item.Type === "Series" || item.Type === "BoxSet";

/** Anything that holds other items rather than being watchable itself. */
const isContainer = (item: BaseItemDto) =>
  item.Type === "Series" ||
  item.Type === "Season" ||
  item.Type === "BoxSet" ||
  item.Type === "Playlist" ||
  item.Type === "Folder" ||
  item.Type === "CollectionFolder" ||
  item.Type === "UserView" ||
  item.Type === "MusicAlbum" ||
  item.Type === "MusicArtist";

/**
 * Watch progress in 0...1, or 0 for anything that isn't a single watchable
 * thing. A container's PlayedPercentage describes some episode inside it, so a
 * bar across a series card would be claiming something it can't know — how far
 * through the series you are. The unplayed-episode badge says that instead.
 */
export const itemProgressFraction = (item: BaseItemDto): number =>
  isContainer(item) ? 0 : getItemProgressPercentage(item) / 100;

/**
 * Only these have a poster; an episode borrows its series', and a person has a
 * portrait headshot. Everything else a library can hold — albums, artists,
 * playlists, folders — has square artwork, and stretching it to 10:15 would
 * crop the cover.
 */
const hasPortraitArtwork = (item: BaseItemDto) =>
  item.Type === "Movie" ||
  item.Type === "Series" ||
  item.Type === "Season" ||
  item.Type === "BoxSet" ||
  item.Type === "Episode" ||
  item.Type === "Person";

/** Returns parent-first labels for latest season and episode cards. */
const latestCardText = (item: BaseItemDto) => {
  if (!item.SeriesName) return null;
  if (item.Type === "Season") {
    return { title: item.SeriesName, subtitle: item.Name };
  }
  if (item.Type !== "Episode") return null;

  return {
    title: item.SeriesName,
    subtitle: cardSubtitle(item, item.Name ?? ""),
  };
};

type BuildOptions = {
  api?: Api | null;
  kind: CardKind;
  /**
   * Width the cards are drawn at, in layout points, which sizes the artwork
   * request. Defaults to the kind's own width; a grid passes its column width.
   */
  cardWidth?: number;
  /** Prefer the episode's own still over the series thumbnail. */
  useEpisodePoster?: boolean;
  /** Show a TV child's series name before its own name, as Jellyfin Web does. */
  showParentTitle?: boolean;
  /** Item to keep at full opacity; every other card is faded back. */
  selectedId?: string | null;
};

/**
 * `BaseItemDto` → card. The one place the labels, image selection and badge
 * rules live, so every row says the same thing about the same item.
 */
export function buildItemCards(
  items: BaseItemDto[],
  {
    api,
    kind,
    cardWidth,
    useEpisodePoster = false,
    showParentTitle = false,
    selectedId,
  }: BuildOptions,
): CardData[] {
  if (!api) return [];

  const layout = CARD_LAYOUTS[kind];
  const imageWidth = cardImageWidth(cardWidth ?? layout.cardWidth);
  const imageHeight = Math.round(imageWidth / layout.aspectRatio);

  return items.flatMap((item) => {
    if (!item.Id) return [];

    const parentFirstText = showParentTitle ? latestCardText(item) : null;
    const title = parentFirstText?.title ?? item.Name ?? "";
    const subtitle = parentFirstText
      ? parentFirstText.subtitle
      : cardSubtitle(item);

    const unplayed = item.UserData?.UnplayedItemCount ?? 0;
    const imageUrl =
      kind === "portrait"
        ? getPortraitImageUrl({ api, item, width: imageWidth })
        : getWideImageUrl({
            api,
            item,
            useEpisodePoster,
            fillWidth: imageWidth,
            fillHeight: imageHeight,
          });

    const progress = itemProgressFraction(item);
    // Strict === false: items without UserData (unknown state) get no dot.
    const unwatched = isMovieOrEpisode(item) && item.UserData?.Played === false;
    const unplayedCount =
      isAggregate(item) && !item.UserData?.Played ? unplayed : 0;
    const dimmed = selectedId != null && item.Id !== selectedId;
    // Only portrait rows and grids mix in items without a poster.
    const aspectRatio =
      kind === "portrait" && !hasPortraitArtwork(item) ? 1 : undefined;

    return [
      {
        id: item.Id,
        title,
        subtitle,
        imageUrl,
        progress,
        unwatched,
        unplayedCount,
        live: isLiveBroadcast(item),
        dimmed,
        aspectRatio,
      },
    ];
  });
}
