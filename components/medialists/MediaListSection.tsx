import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
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
import { useCallback } from "react";
import { View, type ViewProps } from "react-native";
import { ItemCardText } from "../ItemCardText";
import { InfiniteHorizontalScroll } from "../common/InfiniteHorrizontalScroll";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import MoviePoster from "../posters/MoviePoster";

interface Props extends ViewProps {
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto>;
}

export const MediaListSection: React.FC<Props> = ({
  queryFn,
  queryKey,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data: collection } = useQuery({
    queryKey,
    queryFn,
    staleTime: 0,
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

  if (!collection) return null;

  return (
    <View {...props}>
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
      />
    </View>
  );
};
