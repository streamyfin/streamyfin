export type TopShelfCacheModuleEvents = Record<string, never>;

export interface TopShelfCacheItem {
  id: string;
  title: string;
  subtitle?: string;
  contextTitle?: string;
  carouselSummary?: string;
  overview?: string;
  genre?: string;
  durationSeconds?: number;
  releaseDate?: string;
  /**
   * Quality tokens ("4K", "Dolby Vision", "Atmos", "CC"…) mapped to native
   * `TVTopShelfCarouselItem.mediaOptions` on tvOS; absent when empty.
   */
  badges?: string[];
  /**
   * Up to three main cast member names, mapped to a `TVTopShelfNamedAttribute`
   * ("Starring") on the native carousel item; absent when empty.
   */
  cast?: string[];
  /**
   * Up to two director names, mapped to a `TVTopShelfNamedAttribute`
   * ("Director") on the native carousel item; absent when empty.
   */
  director?: string[];
  imageUrl?: string;
  route: string;
  playRoute?: string;
}

export type TopShelfCacheLayout = "sectioned" | "inset" | "carousel";
export type TopShelfCacheContentPreset =
  | "continueAndNextUp"
  | "continueWatching"
  | "nextUp"
  | "recentlyAdded"
  | "recommendations";

export interface TopShelfCacheSection {
  title: string;
  items: TopShelfCacheItem[];
}

export interface TopShelfCachePayload {
  version: 2;
  layout: TopShelfCacheLayout;
  contentPreset: TopShelfCacheContentPreset;
  updatedAt: string;
  sections: TopShelfCacheSection[];
}
