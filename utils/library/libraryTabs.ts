import type { ItemsApiGetItemsRequest } from "@jellyfin/sdk/lib/generated-client/api/items-api";
import type {
  BaseItemDto,
  BaseItemKind,
  MediaType,
} from "@jellyfin/sdk/lib/generated-client/models";
import { supportsLibraryCollectionsAndPlaylists } from "@/utils/jellyfin/serverVersion";

export type LibraryTab = "items" | "collections" | "playlists";

type Library = Pick<BaseItemDto, "Type" | "CollectionType">;

export const LIBRARY_TAB_LABEL_KEYS: Record<LibraryTab, string> = {
  items: "library.tabs.items",
  collections: "library.tabs.collections",
  playlists: "library.tabs.playlists",
};

/**
 * The tabs a library can have next to its own items, before knowing whether
 * they hold anything. Which library type gets which follows jellyfin-web
 * (jellyfin-web#7939, #7946).
 */
export const getLibraryContainerTabs = (
  library: Library,
  serverVersion?: string | null,
): LibraryTab[] => {
  if (!supportsLibraryCollectionsAndPlaylists(serverVersion)) return [];
  // This screen also opens a playlist by its id on TV: only a real library
  // has tabs, and a mixed library is a CollectionFolder without a type.
  if (library.Type !== "CollectionFolder") return [];

  switch (library.CollectionType ?? "unknown") {
    case "movies":
    case "tvshows":
    case "unknown":
      return ["collections", "playlists"];
    case "musicvideos":
      return ["playlists"];
    case "books":
      return ["collections"];
    default:
      return [];
  }
};

/**
 * The tabs to draw: the library's own items, then every container tab that
 * holds something. A count that has not answered yet hides its tab, so a tab
 * never shows up only to disappear. One tab alone is no choice, the caller
 * draws no control for it.
 */
export const getVisibleLibraryTabs = (
  containerTabs: LibraryTab[],
  counts: Partial<Record<LibraryTab, number>>,
): LibraryTab[] => [
  "items",
  ...containerTabs.filter((tab) => (counts[tab] ?? 0) > 0),
];

const ITEM_TYPE_BY_COLLECTION_TYPE = new Map<string, BaseItemKind>([
  ["movies", "Movie"],
  ["tvshows", "Series"],
  ["boxsets", "BoxSet"],
  ["homevideos", "Video"],
  ["musicvideos", "MusicVideo"],
  ["playlists", "Playlist"],
]);

/**
 * What tells one tab's request from another's. The list and the count that
 * decides whether a tab shows both use it, so they cannot disagree.
 */
export const getLibraryTabQuery = (
  tab: LibraryTab,
  library: Library,
  isTV: boolean,
): { includeItemTypes?: BaseItemKind[]; mediaTypes?: MediaType[] } => {
  // The items tab asks for one type when the library has one: the underlying
  // directory sometimes holds other types, and they should not show.
  const itemType: BaseItemKind | undefined =
    tab === "collections"
      ? "BoxSet"
      : tab === "playlists"
        ? "Playlist"
        : ITEM_TYPE_BY_COLLECTION_TYPE.get(library.CollectionType ?? "");

  return {
    includeItemTypes: itemType ? [itemType] : undefined,
    // TV has no music playback, so it only lists video playlists.
    ...(isTV && itemType === "Playlist"
      ? { mediaTypes: ["Video"] as MediaType[] }
      : {}),
  };
};

type FilterBarQuery = Pick<
  ItemsApiGetItemsRequest,
  "sortBy" | "sortOrder" | "filters" | "genres" | "tags" | "years"
>;

/** The filter bar belongs to the items tab, see `getLibraryTabFilters`. */
export const libraryTabUsesFilterBar = (tab: LibraryTab) => tab === "items";

/**
 * What the filter bar adds to a tab's request. Its genres, years and tags are
 * those of the library's own items and say nothing about a collection or a
 * playlist, so the bar is hidden on those tabs and none of it applies: with a
 * saved genre filter they would otherwise open empty. They are sorted by name.
 */
export const getLibraryTabFilters = (
  tab: LibraryTab,
  filterBar: FilterBarQuery,
): FilterBarQuery =>
  libraryTabUsesFilterBar(tab)
    ? filterBar
    : { sortBy: ["SortName"], sortOrder: ["Ascending"] };
