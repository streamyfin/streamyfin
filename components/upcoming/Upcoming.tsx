import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CardData } from "@/components/cards/CardData";
import { CardPill } from "@/components/cards/CardPill";
import { CardRow } from "@/components/cards/CardRow";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { useEpisodeAirLabels } from "@/hooks/useEpisodeAirLabels";
import { useUpcomingEpisodes } from "@/hooks/useUpcomingEpisodes";

type Props = {
  /** Library to list. Every library when left out. */
  parentId?: string;
};

/** Upcoming episodes, one row per air day. The TV screen is `TVUpcoming`. */
export const Upcoming: React.FC<Props> = ({ parentId }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { groups, isLoading, isError, isFetchingNextPage, loadMore } =
    useUpcomingEpisodes(parentId);
  const { dayLabel, timeLabel } = useEpisodeAirLabels();

  // The air time goes on the artwork: the day is the row's heading already.
  const slots = useMemo(() => {
    const timeById = new Map(
      groups.flatMap((group) =>
        group.items.map((item) => [item.Id, timeLabel(item)] as const),
      ),
    );
    return {
      overlay: (card: CardData) => {
        const time = timeById.get(card.id);
        return time ? <CardPill label={time} /> : null;
      },
    };
  }, [groups, timeLabel]);

  if (isLoading)
    return (
      <View className='w-full h-full flex items-center justify-center'>
        <Loader />
      </View>
    );

  return (
    <FlatList
      data={groups}
      keyExtractor={(group) => group.day}
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingTop: 16,
        paddingBottom: 24,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      renderItem={({ item: group }) => (
        <CardRow
          className='mb-4'
          title={dayLabel(group.day)}
          items={group.items}
          showParentTitle
          slots={slots}
          enableActionSheet
        />
      )}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
      ListEmptyComponent={
        <Text className='px-4 text-neutral-500'>
          {isError
            ? t("common.something_went_wrong")
            : t("upcoming.no_episodes")}
        </Text>
      }
      ListFooterComponent={isFetchingNextPage ? <Loader /> : null}
    />
  );
};
