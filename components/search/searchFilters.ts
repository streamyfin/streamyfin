/** The two tabs of the Search screen. */
export type SearchType = "Library" | "Discover";

/**
 * Whether the Search screen shows its sort. Both tabs sort what the search
 * found, the Library results and Seerr's, so any search gets it. What the
 * library search found has no bearing on Discover: its results stay cached
 * while the Discover tab is open.
 */
export const showSearchSort = (query: string) => query.length > 0;
