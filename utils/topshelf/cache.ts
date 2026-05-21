import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Platform } from "react-native";
import {
  clearTopShelfCache,
  type TopShelfCachePayload,
  type TopShelfCacheSection,
  writeTopShelfCache,
} from "@/modules";

const TOP_SHELF_ITEM_LIMIT = 12;

function getTopShelfImageUrl(item: BaseItemDto, api: Api): string | undefined {
  const baseUrl = api.basePath;

  if (item.Type === "Episode") {
    if (item.SeriesId && item.SeriesPrimaryImageTag) {
      return `${baseUrl}/Items/${item.SeriesId}/Images/Primary?quality=90&tag=${encodeURIComponent(item.SeriesPrimaryImageTag)}&width=500`;
    }

    if (item.ParentPrimaryImageItemId && item.ParentPrimaryImageTag) {
      return `${baseUrl}/Items/${item.ParentPrimaryImageItemId}/Images/Primary?quality=90&tag=${encodeURIComponent(item.ParentPrimaryImageTag)}&width=500`;
    }
  }

  const primaryTag = item.ImageTags?.Primary;
  if (item.Id && primaryTag) {
    return `${baseUrl}/Items/${item.Id}/Images/Primary?quality=90&tag=${encodeURIComponent(primaryTag)}&width=500`;
  }

  const backdropTag = item.BackdropImageTags?.[0];
  if (item.Id && backdropTag) {
    return `${baseUrl}/Items/${item.Id}/Images/Backdrop/0?quality=90&tag=${encodeURIComponent(backdropTag)}&width=800`;
  }

  return undefined;
}

function formatEpisodeNumber(item: BaseItemDto): string | undefined {
  const season = item.ParentIndexNumber;
  const episode = item.IndexNumber;

  if (season != null && episode != null) {
    return `S${season} • E${episode}`;
  }

  if (season != null) return `Season ${season}`;
  if (episode != null) return `Episode ${episode}`;

  return undefined;
}

function getTopShelfTitle(item: BaseItemDto): string {
  if (item.Type === "Episode") {
    const episodeNumber = formatEpisodeNumber(item);

    if (item.SeriesName && episodeNumber) {
      return `${item.SeriesName} - ${episodeNumber}`;
    }

    if (item.SeriesName) return item.SeriesName;
    if (episodeNumber) return episodeNumber;
    return item.Name || "";
  }

  return item.Name || "";
}

function getTopShelfSubtitle(item: BaseItemDto): string | undefined {
  if (item.Type === "Episode") return undefined;

  return item.ProductionYear ? String(item.ProductionYear) : item.Type;
}

function sectionFromItems(
  title: string,
  items: BaseItemDto[] | undefined,
  api: Api,
): TopShelfCacheSection | null {
  const cacheItems = (items || [])
    .filter((item) => item.Id && item.Name)
    .slice(0, TOP_SHELF_ITEM_LIMIT)
    .map((item) => ({
      id: item.Id!,
      title: getTopShelfTitle(item),
      subtitle: getTopShelfSubtitle(item),
      imageUrl: getTopShelfImageUrl(item, api),
      route: `streamyfin://topshelf/item?id=${encodeURIComponent(item.Id!)}&type=${encodeURIComponent(item.Type || "")}`,
      playRoute: `streamyfin://topshelf/play?id=${encodeURIComponent(item.Id!)}`,
    }));

  if (cacheItems.length === 0) return null;

  return {
    title,
    items: cacheItems,
  };
}

export function updateTopShelfCache({
  api,
  sections,
}: {
  api: Api | null | undefined;
  sections: Array<{ title: string; items: BaseItemDto[] | undefined }>;
}): void {
  if (Platform.OS !== "ios" || !Platform.isTV) return;

  if (!api) {
    clearTopShelfCacheSafely();
    return;
  }

  const payloadSections = sections
    .map((section) => sectionFromItems(section.title, section.items, api))
    .filter((section): section is TopShelfCacheSection => section !== null)
    .slice(0, 3);

  if (payloadSections.length === 0) {
    clearTopShelfCacheSafely();
    return;
  }

  const payload: TopShelfCachePayload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sections: payloadSections,
  };

  try {
    const didWrite = writeTopShelfCache(
      JSON.stringify(payload),
      api.accessToken || undefined,
    );

    if (__DEV__ && !didWrite) {
      console.warn("[TopShelf] Native cache writer is unavailable");
    }
  } catch (error) {
    if (__DEV__) {
      console.warn("[TopShelf] Failed to write cache", error);
    }
  }
}

export function clearTopShelfCacheSafely(): void {
  if (Platform.OS !== "ios" || !Platform.isTV) return;

  try {
    const didClear = clearTopShelfCache();

    if (__DEV__ && !didClear) {
      console.warn("[TopShelf] Native cache clearer is unavailable");
    }
  } catch (error) {
    if (__DEV__) {
      console.warn("[TopShelf] Failed to clear cache", error);
    }
  }
}
