import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getItemRefreshApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { apiAtom } from "@/providers/JellyfinProvider";

export const useRefreshMetadata = (item: BaseItemDto) => {
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();
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
      toast.success(t("metadata.refresh_triggered"));
      queryClient.invalidateQueries({ queryKey: [type, item.Id] });
    },
    onError: (error) => {
      console.error("Failed to refresh metadata:", error);
      toast.error(t("metadata.refresh_failed"));
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
