import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

export const useItemQuery = (itemId: string, isOffline: boolean) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { getDownloadedItemById } = useDownload();

  return useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      if (isOffline) {
        return getDownloadedItemById(itemId)?.item;
      }
      if (!api || !user || !itemId) return null;
      const res = await getUserLibraryApi(api).getItem({
        itemId: itemId,
        userId: user?.Id,
      });
      return res.data;
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: "always",
  });
};
