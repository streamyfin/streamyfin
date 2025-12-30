import { ItemFields } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useVideoApi } from "@/providers/MediaApiProvider";

// Helper to exclude specific fields
export const excludeFields = (fieldsToExclude: ItemFields[]) => {
  return Object.values(ItemFields).filter(
    (field) => !fieldsToExclude.includes(field),
  );
};

/**
 * Query hook for fetching a single video item (Movie, Episode, Series)
 * Uses unified Video API - automatically handles online/offline mode
 *
 * @param itemId - The item ID to fetch
 * @param _isOffline - Deprecated: offline mode is now automatic
 * @param _fields - Deprecated: fields are now determined by the API
 * @param _excludeFields - Deprecated: fields are now determined by the API
 * @returns Query result with BaseItemDto for backwards compatibility
 */
export const useItemQuery = (
  itemId: string | undefined,
  _isOffline?: boolean,
  _fields?: ItemFields[],
  _excludeFields?: ItemFields[],
) => {
  const videoApi = useVideoApi();

  return useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      if (!itemId) throw new Error("Item ID is required");

      const result = await videoApi.getItem(itemId);

      // Return jellyfinItem for backwards compatibility with existing components
      return result?.jellyfinItem ?? null;
    },
    enabled: !!itemId,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: "always",
  });
};
