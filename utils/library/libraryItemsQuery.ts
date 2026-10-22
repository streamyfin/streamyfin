import type { ItemsApiGetItemsRequest } from "@jellyfin/sdk/lib/generated-client/api/items-api";
import type {
  BaseItemDto,
  BaseItemKind,
  ItemFilter,
  ItemSortBy,
  SortOrder,
} from "@jellyfin/sdk/lib/generated-client/models";
import type { RawAxiosRequestConfig } from "axios";
import { PLAY_QUEUE_MAX_ITEMS } from "@/constants/Playback";
import { languageFilterRequestOptions } from "@/utils/jellyfin/languageFilters";
import { sortsSeriesDatePlayedQuickly } from "@/utils/jellyfin/serverVersion";

type CollectionType = BaseItemDto["CollectionType"];

/** What the filter bar of a library page currently selects. */
export interface LibraryItemsFilter {
  userId?: string;
  libraryId: string;
  collectionType?: CollectionType;
  sortBy: ItemSortBy;
  sortOrder: SortOrder;
  filterBy: ItemFilter[];
  genres: string[];
  officialRatings: string[];
  years: string[];
  tags: string[];
  audioLanguages?: string[];
  subtitleLanguages?: string[];
  /** The Jellyfin server's version, for the keys only some versions handle well. */
  serverVersion?: string | null;
}

// Only one kind of item per library, when the library names one: the
// underlying directory sometimes holds other kinds, and they must not show.
export const ITEM_TYPE_BY_COLLECTION: Partial<
  Record<NonNullable<CollectionType>, BaseItemKind>
> = {
  movies: "Movie",
  tvshows: "Series",
  boxsets: "BoxSet",
  homevideos: "Video",
  musicvideos: "MusicVideo",
  playlists: "Playlist",
};

/**
 * The kinds of item a library page lists: the one its collection type names,
 * or every kind when it names none. The rating choices are asked for the same
 * kinds, so they only offer ratings the grid can match.
 */
export const getLibraryItemTypes = (
  collectionType: CollectionType | null | undefined,
): BaseItemKind[] | undefined => {
  const itemType = collectionType
    ? ITEM_TYPE_BY_COLLECTION[collectionType]
    : undefined;
  return itemType ? [itemType] : undefined;
};

/**
 * The key a selected sort goes to the server as. A show's own DatePlayed reads
 * user data that playback never writes (it lands on the episodes), so a Shows
 * library or view sorts by the series-level key, as jellyfin-web does, on the
 * servers that answer it quickly: on 10.11 it can take a minute, where the
 * plain key answers at once, in name order. The saved preference keeps the
 * DatePlayed name.
 */
export const serverSortBy = (
  sortBy: ItemSortBy,
  collectionType: CollectionType | null | undefined,
  serverVersion?: string | null,
): ItemSortBy =>
  collectionType === "tvshows" &&
  sortBy === "DatePlayed" &&
  sortsSeriesDatePlayedQuickly(serverVersion)
    ? "SeriesDatePlayed"
    : sortBy;

/**
 * The part of the items request that decides which items a library page
 * lists and in what order. The grid and the play queue both start from it, so
 * Play All can never queue something the filters hide.
 */
export const buildLibraryItemsQuery = ({
  userId,
  libraryId,
  collectionType,
  sortBy,
  sortOrder,
  filterBy,
  genres,
  officialRatings,
  years,
  tags,
  serverVersion,
}: LibraryItemsFilter): ItemsApiGetItemsRequest => {
  return {
    userId,
    parentId: libraryId,
    sortBy: [
      serverSortBy(sortBy, collectionType, serverVersion),
      "SortName",
      "ProductionYear",
    ],
    sortOrder: [sortOrder],
    filters: filterBy,
    // true is needed for merged versions
    recursive: true,
    genres,
    officialRatings,
    tags,
    years: years.map((year) => Number.parseInt(year, 10)),
    includeItemTypes: getLibraryItemTypes(collectionType),
  };
};

/**
 * The selected audio and subtitle languages, as the second argument of
 * getItems: SDK 0.13 has no request field for them. Every request built from
 * a filter passes this along, the grid's and the queue's alike.
 */
export const libraryLanguageOptions = ({
  audioLanguages = [],
  subtitleLanguages = [],
}: LibraryItemsFilter): RawAxiosRequestConfig | undefined =>
  languageFilterRequestOptions({ audioLanguages, subtitleLanguages });

/**
 * Whether the library page lists things a player can open one after another.
 * A series, a box set or a playlist is a container: the filters select the
 * container, not the videos in it, so there is no "current list" to queue.
 * A library without a collection type (mixed content, a plain folder) lists
 * videos among other things, and the queue request keeps only those.
 */
export const isQueueableLibrary = (collectionType: CollectionType): boolean =>
  !collectionType ||
  collectionType === "movies" ||
  collectionType === "homevideos" ||
  collectionType === "musicvideos";

/**
 * The request behind Play All and Shuffle: the list on screen, cut down to
 * what can be played and capped. Shuffle lets the server pick the order, so
 * the cap draws a random sample of the whole filtered library instead of
 * reordering its first page.
 */
export const buildLibraryQueueQuery = (
  filter: LibraryItemsFilter,
  { shuffle }: { shuffle: boolean },
): ItemsApiGetItemsRequest => {
  const query = buildLibraryItemsQuery(filter);

  return {
    ...query,
    ...(shuffle ? { sortBy: ["Random"], sortOrder: undefined } : {}),
    filters: [...filter.filterBy, "IsNotFolder"],
    mediaTypes: ["Video"],
    // A server that groups movies into collections would answer with the box
    // sets, which no player can open.
    collapseBoxSetItems: false,
    // Missing episodes and other placeholders have no media file.
    excludeLocationTypes: ["Virtual"],
    limit: PLAY_QUEUE_MAX_ITEMS,
    // The players pick the next item's tracks from its media sources.
    fields: ["MediaSources"],
    enableTotalRecordCount: false,
  };
};
