import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import React, { PropsWithChildren } from "react";
import { Text } from "../common/Text";
import {FlashList} from "@shopify/flash-list";

type SearchItemWrapperProps<T> = {
  ids?: string[] | null;
  items?: T[];
  renderItem: (item: any) => React.ReactNode;
  header?: string;
  onEndReached?: (() => void) | null | undefined;
};

export const SearchItemWrapper = <T extends unknown>({
  ids,
  items,
  renderItem,
  header,
  onEndReached
}: PropsWithChildren<SearchItemWrapperProps<T>>) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data, isLoading: l1 } = useQuery({
    queryKey: ["items", ids],
    queryFn: async () => {
      if (!user?.Id || !api || !ids || ids.length === 0) {
        return [];
      }

      const itemPromises = ids.map((id) =>
        getUserItemData({
          api,
          userId: user.Id,
          itemId: id,
        })
      );

      const results = await Promise.all(itemPromises);

      // Filter out null items
      return results.filter(
        (item) => item !== null
      ) as unknown as BaseItemDto[];
    },
    enabled: !!ids && ids.length > 0 && !!api && !!user?.Id,
    staleTime: Infinity,
  });

  if (!data && (!items || items.length === 0)) return null;

  return (
    <>
      <Text className="font-bold text-lg px-4 mb-2">{header}</Text>
      <FlashList
        horizontal
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 8,
        }}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, index) => index.toString()}
        estimatedItemSize={250}
        /*@ts-ignore */
        data={data || items}
        onEndReachedThreshold={1}
        onEndReached={onEndReached}
        //@ts-ignore
        renderItem={({item, index}) => item ? renderItem(item) : <></>}
      />
    </>
  );
};
