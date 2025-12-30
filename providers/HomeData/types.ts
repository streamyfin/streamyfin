import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { QueryFunction } from "@tanstack/react-query";

/**
 * Section types for the home screen
 */
export type InfiniteScrollingCollectionListSection = {
  type: "InfiniteScrollingCollectionList";
  title?: string;
  queryKey: (string | undefined | null)[];
  queryFn: QueryFunction<BaseItemDto[], any, number>;
  orientation?: "horizontal" | "vertical";
  pageSize?: number;
};

export type MediaListSectionType = {
  type: "MediaListSection";
  queryKey: (string | undefined)[];
  queryFn: QueryFunction<BaseItemDto>;
};

export type HomeSection =
  | InfiniteScrollingCollectionListSection
  | MediaListSectionType;

/**
 * Backend interface for fetching home screen data
 */
export interface IHomeDataBackend {
  /**
   * Get default sections for the home screen
   */
  getDefaultSections(): HomeSection[];

  /**
   * Check if the backend is available
   */
  isAvailable(): boolean;
}
