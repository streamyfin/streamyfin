import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { Loader } from "@/components/Loader";
import { TVHorizontalList } from "@/components/tv/TVHorizontalList";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { TVPosterPill } from "@/components/tv/TVPosterPill";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useEpisodeAirLabels } from "@/hooks/useEpisodeAirLabels";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { useUpcomingEpisodes } from "@/hooks/useUpcomingEpisodes";
import { scaleSize } from "@/utils/scaleSize";
import type { AirDayGroup } from "@/utils/upcomingEpisodes";

// Clears the tab bar drawn over the top of every TV screen.
const TOP_PADDING = scaleSize(100);

type Props = {
  /** Library to list. Every library when left out. */
  parentId?: string;
};

/** Upcoming episodes on TV: one focusable row of episodes per air day. */
export const TVUpcoming: React.FC<Props> = ({ parentId }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  const router = useRouter();
  const { showItemActions } = useTVItemActionModal();
  const { groups, isLoading, isError, isFetchingNextPage, loadMore } =
    useUpcomingEpisodes(parentId);
  const { dayLabel, timeLabel } = useEpisodeAirLabels();
  const padding = insets.left + sizes.padding.horizontal;
  const headingSize = typography.heading;
  // The first card asks for the focus once, when the screen opens. The list
  // unmounts the rows far from view, and a refetch can change the first day:
  // a first card that mounts later must not pull the focus back to the top.
  const [focusGiven, setFocusGiven] = useState(false);

  const renderGroup = useCallback(
    ({ item: group, index: row }: { item: AirDayGroup; index: number }) => (
      <View style={{ paddingHorizontal: padding, overflow: "visible" }}>
        <Text
          style={{
            fontSize: headingSize,
            fontWeight: "700",
            marginBottom: scaleSize(12),
          }}
        >
          {dayLabel(group.day)}
        </Text>
        <TVHorizontalList
          data={group.items}
          keyExtractor={(episode: BaseItemDto) => episode.Id!}
          horizontalPadding={padding}
          renderItem={({ item: episode, index }) => {
            const time = timeLabel(episode);
            return (
              <TVPosterCard
                item={episode}
                orientation='horizontal'
                displayShowName
                // The only preferred focus on the screen: nothing above the
                // list can take it.
                hasTVPreferredFocus={!focusGiven && row === 0 && index === 0}
                onFocus={() => setFocusGiven(true)}
                onPress={() =>
                  router.push(getItemNavigation(episode, "(libraries)") as any)
                }
                onLongPress={() => showItemActions(episode)}
                overlay={time ? <TVPosterPill label={time} /> : undefined}
              />
            );
          }}
        />
      </View>
    ),
    [
      padding,
      headingSize,
      focusGiven,
      dayLabel,
      timeLabel,
      router,
      showItemActions,
    ],
  );

  return (
    <View style={{ flex: 1, paddingTop: insets.top + TOP_PADDING }}>
      {/* A sibling of the list, not its header: see docs/conventions/tv.md. */}
      <Text
        style={{
          fontSize: typography.title,
          fontWeight: "700",
          marginLeft: padding,
          marginBottom: scaleSize(24),
        }}
      >
        {t("upcoming.title")}
      </Text>
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Loader />
        </View>
      ) : groups.length === 0 ? (
        <Text
          style={{
            fontSize: typography.body,
            color: "#737373",
            marginLeft: padding,
          }}
        >
          {isError
            ? t("common.something_went_wrong")
            : t("upcoming.no_episodes")}
        </Text>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(group) => group.day}
          renderItem={renderGroup}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            gap: sizes.gaps.section,
            paddingBottom: insets.bottom + scaleSize(60),
          }}
          onEndReached={loadMore}
          onEndReachedThreshold={1}
          ListFooterComponent={isFetchingNextPage ? <Loader /> : null}
        />
      )}
    </View>
  );
};
