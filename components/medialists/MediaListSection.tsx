import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import {
  type QueryFunction,
  type QueryKey,
  useQuery,
} from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback } from "react";
import { View, type ViewProps } from "react-native";
import { InfiniteScrollingCollectionList } from "@/components/home/InfiniteScrollingCollectionList";
import { useInView } from "@/hooks/useInView";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const PAGE_SIZE = 8;

interface Props extends ViewProps {
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto>;
  scrollY?: number; // For lazy loading
  enableLazyLoading?: boolean; // Enable/disable lazy loading
}

/**
 * A home row for a server-defined media list: one query to resolve the
 * collection, then its children paged into the standard card row.
 *
 * The lazy mount stays here rather than in the row — whether a section is on
 * screen is the home feed's business, not the row's.
 */
export const MediaListSection: React.FC<Props> = ({
  queryFn,
  queryKey,
  scrollY = 0,
  enableLazyLoading = false,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { ref, isInView, onLayout } = useInView(scrollY, {
    enabled: enableLazyLoading,
  });

  const { data: collection } = useQuery({
    queryKey,
    queryFn,
    staleTime: 60 * 1000, // 1 minute
    enabled: enableLazyLoading ? isInView : true,
  });

  const collectionId = collection?.Id;

  const fetchItems = useCallback(
    async ({ pageParam }: { pageParam: number }): Promise<BaseItemDto[]> => {
      if (!api || !user?.Id || !collectionId) return [];

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        parentId: collectionId,
        startIndex: pageParam,
        limit: PAGE_SIZE,
      });

      return response.data.Items ?? [];
    },
    [api, user?.Id, collectionId],
  );

  if (!collection) return null;

  return (
    <View ref={ref} onLayout={onLayout} {...props}>
      <InfiniteScrollingCollectionList
        title={collection.Name}
        queryKey={["media-list", collectionId ?? ""]}
        queryFn={fetchItems}
        pageSize={PAGE_SIZE}
      />
    </View>
  );
};
