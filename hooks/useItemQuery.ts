import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { ItemFields } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

export const useItem = (
  itemId: string | undefined,
  fields?: ItemFields[],
  isOffline?: boolean
) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { getDownloadedItemById } = useDownload();

  return useQuery({
    queryKey: ["item", itemId, fields],
    queryFn: async () => {
      if (!itemId) throw new Error('Item ID is required');
      
      if (isOffline) {
        return getDownloadedItemById(itemId)?.item;
      }
      
      if (!api || !user) return null;
      
      const response = await getUserLibraryApi(api).getItem({
        itemId,
        userId: user.Id,
        ...(fields && { fields }),
      });
      
      return response.data;
    },
    enabled: !!itemId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: "always",
  });
};