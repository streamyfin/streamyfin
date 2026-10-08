/** The two tabs of the Search screen. */
export type SearchType = "Library" | "Discover";

/**
 * Whether the Search screen shows the Discover filters. They sort Seerr's
 * results, so any Discover search gets them; what the library search found has
 * no bearing, and its results stay cached while the Discover tab is open.
 */
export const showDiscoverFilters = (searchType: SearchType, query: string) =>
  searchType === "Discover" && query.length > 0;
