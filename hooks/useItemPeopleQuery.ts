import type {
  BaseItemPerson,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

export const useItemPeopleQuery = (
  itemId: string | undefined,
  enabled: boolean,
) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  return useQuery<BaseItemPerson[]>({
    queryKey: ["item", itemId, "people"],
    queryFn: async () => {
      if (!api || !user?.Id || !itemId) return [];

      const response = await getItemsApi(api).getItems({
        ids: [itemId],
        userId: user.Id,
        fields: ["People" satisfies ItemFields],
      });

      const people = response.data.Items?.[0]?.People;
      return Array.isArray(people) ? people : [];
    },
    enabled: !!api && !!user?.Id && !!itemId && enabled,
    staleTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
};
