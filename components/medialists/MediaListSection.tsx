import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import {
  type QueryFunction,
  type QueryKey,
  useQuery,
} from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { View, type ViewProps } from "react-native";
import { useInView } from "@/hooks/useInView";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { InfiniteHorizontalScroll } from "../common/InfiniteHorizontalScroll";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { ItemCardText } from "../ItemCardText";
import MoviePoster from "../posters/MoviePoster";

interface Props extends ViewProps {
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto>;
  scrollY?: number; // For lazy loading
  enableLazyLoading?: boolean; // Enable/disable lazy loading
}

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

  const fetchItems = useCallback(
    async ({
      pageParam,
    }: {
      pageParam: number;
    }): Promise<BaseItemDtoQueryResult | null> => {
      if (!api || !user?.Id || !collection) return null;

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        parentId: collection.Id,
        startIndex: pageParam,
        limit: 8,
      });

      return response.data;
    },
    [api, user?.Id, collection?.Id],
  );

  const snapOffsets = useMemo(() => {
    const itemWidth = 120; // w-28 (112px) + mr-2 (8px)
    // Generate offsets for a reasonable number of items
    return Array.from({ length: 50 }, (_, index) => index * itemWidth);
  }, []);

  if (!collection) return null;

  return (
    <View ref={ref} onLayout={onLayout} {...props}>
      <Text className='px-4 text-lg font-bold mb-2 text-neutral-100'>
        {collection.Name}
      </Text>
      <InfiniteHorizontalScroll
        height={247}
        renderItem={(item, index) => (
          <TouchableItemRouter
            key={index}
            item={item}
            className={`flex flex-col
              ${"w-28"}
            `}
          >
            <View>
              <MoviePoster item={item} />
              <ItemCardText item={item} />
            </View>
          </TouchableItemRouter>
        )}
        queryFn={fetchItems}
        queryKey={["media-list", collection.Id!]}
        snapToOffsets={snapOffsets}
        decelerationRate='fast'
      />
    </View>
  );
};
