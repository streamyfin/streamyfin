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
