import { ItemFields } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

// Helper to exclude specific fields
export const excludeFields = (fieldsToExclude: ItemFields[]) => {
  return Object.values(ItemFields).filter(
    (field) => !fieldsToExclude.includes(field),
  );
};

export const useItemQuery = (
  itemId: string | undefined,
  isOffline?: boolean,
  fields?: ItemFields[],
  excludeFields?: ItemFields[],
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

      if (isOffline) {
        return getDownloadedItemById(itemId)?.item;
      }

      if (!api || !user) return null;

      const response = await getItemsApi(api).getItems({
        ids: [itemId],
        userId: user.Id,
        ...(finalFields && { fields: finalFields }),
      });

      return response.data.Items?.[0];
    },
    enabled: !!itemId,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: "always",
  });
};
