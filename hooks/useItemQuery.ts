import { ItemFields } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { Platform } from "react-native";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

// Helper to exclude specific fields
export const excludeFields = (fieldsToExclude: ItemFields[]) => {
  return Object.values(ItemFields).filter(
    (field) => !fieldsToExclude.includes(field),
  );
};

type ExtraQueryOptions = {
  gcTime?: number;
  staleTime?: number;
};

export const useItemQuery = (
  itemId: string | undefined,
  isOffline?: boolean,
  fields?: ItemFields[],
  excludeFields?: ItemFields[],
  queryOptions?: ExtraQueryOptions,
) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { getDownloadedItemById } = useDownload();

  // Calculate final fields: use excludeFields if provided, otherwise use fields
  const finalFields = excludeFields
    ? Object.values(ItemFields).filter(
        (field) => !excludeFields.includes(field),
      )
    : fields;

  return useQuery({
    queryKey: ["item", itemId, finalFields],
    queryFn: async () => {
      if (!itemId) throw new Error("Item ID is required");

      // null, never undefined: React Query treats a queryFn that resolves
      // undefined as an error ("<key> data is undefined" thrown at the user).
      if (isOffline) {
        return getDownloadedItemById(itemId)?.item ?? null;
      }

      if (!api || !user) return null;

      const response = await getItemsApi(api).getItems({
        ids: [itemId],
        userId: user.Id,
        ...(finalFields && { fields: finalFields }),
      });

      // Zero items (deleted on the server, access revoked) is a valid answer.
      return response.data.Items?.[0] ?? null;
    },
    enabled: !!itemId,
    staleTime: isOffline ? Infinity : 60 * 1000,
    refetchInterval: !isOffline && Platform.isTV ? 60 * 1000 : undefined,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: "always",
    ...queryOptions,
  });
};
