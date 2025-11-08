import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getItemRefreshApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { toast } from "sonner-native";
import { apiAtom } from "@/providers/JellyfinProvider";

export const useRefreshMetadata = (item: BaseItemDto) => {
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const type = "item";

  const refreshMetadataMutation = useMutation({
    mutationFn: async () => {
      if (api && item.Id) {
        await getItemRefreshApi(api).refreshItem({
          itemId: item.Id,
        });
      }
    },
    onSuccess: () => {
      toast.success("Metadata refresh triggered");
      queryClient.invalidateQueries({ queryKey: [type, item.Id] });
    },
    onError: (error) => {
      console.error("Failed to refresh metadata:", error);
      toast.error("Failed to refresh metadata");
    },
  });

  const refreshMetadata = () => {
    refreshMetadataMutation.mutate();
  };

  return {
    refreshMetadata,
    isRefreshing: refreshMetadataMutation.isPending,
    refreshMetadataMutation,
  };
};
