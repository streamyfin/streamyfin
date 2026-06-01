import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto, UserDto } from "@jellyfin/sdk/lib/generated-client";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useEffect, useMemo, useState } from "react";
import type { MediaStatus } from "react-native-google-cast";

interface UseCastPlayerItemParams {
  api: Api | null;
  user: UserDto | null;
  mediaStatus: MediaStatus | null;
}

interface UseCastPlayerItemResult {
  fetchedItem: BaseItemDto | null;
  currentItem: BaseItemDto | null;
}

export function useCastPlayerItem({
  api,
  user,
  mediaStatus,
}: UseCastPlayerItemParams): UseCastPlayerItemResult {
  // Fetch full item data from Jellyfin by ID
  const [fetchedItem, setFetchedItem] = useState<BaseItemDto | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchItemData = async () => {
      const itemId = mediaStatus?.mediaInfo?.contentId;
      if (!itemId || !api || !user?.Id) return;

      try {
        const res = await getUserLibraryApi(api).getItem(
          { itemId, userId: user.Id },
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setFetchedItem(res.data);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.error("[Casting Player] Failed to fetch item:", error);
      }
    };

    fetchItemData();

    return () => controller.abort();
  }, [mediaStatus?.mediaInfo?.contentId, api, user?.Id]);

  // Extract item from customData, or use fetched item, or create a minimal fallback
  const currentItem = useMemo(() => {
    // Priority 1: Use fetched item from API (most reliable)
    if (fetchedItem) {
      return fetchedItem;
    }

    // Priority 2: Try customData from mediaStatus
    const customData = mediaStatus?.mediaInfo?.customData as BaseItemDto | null;
    if (
      customData?.Type &&
      (customData.ImageTags || customData.MediaSources || customData.Id)
    ) {
      // Use customData if it has a real Type AND meaningful metadata
      // (rules out placeholder objects that lack image tags, media sources, or an ID)
      return customData;
    }

    // Priority 3: Create minimal fallback while loading
    if (mediaStatus?.mediaInfo) {
      const { contentId, metadata } = mediaStatus.mediaInfo;
      // Derive type from metadata if available, otherwise omit to avoid
      // misrepresenting episodes as movies
      let metadataType: string | undefined;
      if (metadata?.type === "movie") {
        metadataType = "Movie";
      } else if (metadata?.type === "tvShow") {
        metadataType = "Episode";
      }
      return {
        Id: contentId,
        Name: metadata?.title || "Unknown",
        ...(metadataType ? { Type: metadataType } : {}),
        ServerId: "",
      } as BaseItemDto;
    }

    return null;
  }, [fetchedItem, mediaStatus?.mediaInfo]);

  return { fetchedItem, currentItem };
}
