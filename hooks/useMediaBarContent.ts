import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

type MediaBarContentSource = "list" | "random" | "none";

export type MediaBarContent = {
  source: MediaBarContentSource;
  itemIds: string[];
  items: BaseItemDto[];
};

const SUPPORTED_MEDIA_TYPES = new Set([
  "Movie",
  "Series",
  "Episode",
  "Program",
  "Video",
  "BoxSet",
]);

const parseListIds = (text: string): string[] =>
  text
    .split("\n")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(1);

const hasAnyImage = (item: BaseItemDto): boolean =>
  Boolean(
    item.BackdropImageTags?.length ||
      item.ImageTags?.Backdrop ||
      item.ImageTags?.Primary ||
      item.ImageTags?.Thumb ||
      item.ImageTags?.Logo ||
      item.ParentThumbImageTag ||
      item.ParentLogoImageTag,
  );

const isSupportedMediaBarItem = (item: BaseItemDto): boolean =>
  Boolean(
    item.Id &&
      item.Type &&
      SUPPORTED_MEDIA_TYPES.has(item.Type) &&
      hasAnyImage(item),
  );

export const useMediaBarContent = ({
  enabled = true,
  limit = 12,
}: {
  enabled?: boolean;
  limit?: number;
}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const safeLimit = Math.max(1, limit);

  return useQuery({
    queryKey: ["media-bar-content", api?.basePath, user?.Id, safeLimit],
    enabled: !!api && !!user?.Id && enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<MediaBarContent> => {
      if (!api || !user?.Id) {
        return { source: "none", itemIds: [], items: [] };
      }

      try {
        const listResponse = await api.get<string>(
          `/web/avatars/list.txt?userId=${user.Id}`,
          {
            responseType: "text",
          },
        );
        const listText =
          typeof listResponse.data === "string" ? listResponse.data : "";
        const itemIds = parseListIds(listText).slice(0, 100);

        if (itemIds.length > 0) {
          const itemsResponse = await getItemsApi(api).getItems({
            userId: user.Id,
            ids: itemIds,
            fields: [
              "Overview",
              "Genres",
              "RemoteTrailers",
              "DateCreated",
              "PrimaryImageAspectRatio",
            ],
            enableImageTypes: ["Primary", "Backdrop", "Logo"],
          });

          const fetchedItems = itemsResponse.data.Items ?? [];
          const fetchedById = new Map<string, BaseItemDto>();
          for (const item of fetchedItems) {
            if (!item.Id) continue;
            fetchedById.set(item.Id, item);
          }

          const orderedItems = itemIds
            .map((id) => fetchedById.get(id))
            .filter((item): item is BaseItemDto => Boolean(item))
            .filter(isSupportedMediaBarItem)
            .slice(0, safeLimit);

          return {
            source: "list",
            itemIds: orderedItems.map((item) => item.Id!),
            items: orderedItems,
          };
        }
      } catch (_error) {
        // Fallback to random list below
      }

      try {
        const randomResponse = await getItemsApi(api).getItems({
          userId: user.Id,
          includeItemTypes: ["Movie", "Series"],
          recursive: true,
          hasOverview: true,
          sortBy: ["Random"],
          isPlayed: false,
          enableUserData: true,
          limit: 500,
          fields: [
            "Overview",
            "Genres",
            "RemoteTrailers",
            "DateCreated",
            "PrimaryImageAspectRatio",
          ],
          enableImageTypes: ["Primary", "Backdrop", "Logo"],
        });
        const randomItems = (randomResponse.data.Items ?? [])
          .filter(isSupportedMediaBarItem)
          .slice(0, safeLimit);

        return {
          source: "random",
          itemIds: randomItems
            .map((item) => item.Id)
            .filter((id): id is string => typeof id === "string"),
          items: randomItems,
        };
      } catch (_error) {
        return { source: "none", itemIds: [], items: [] };
      }
    },
  });
};
