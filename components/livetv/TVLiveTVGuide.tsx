import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { TVGuideChannelRow } from "./TVGuideChannelRow";
import { TVGuidePageNavigation } from "./TVGuidePageNavigation";
import { TVGuideTimeHeader } from "./TVGuideTimeHeader";

// Design constants
const CHANNEL_COLUMN_WIDTH = 240;
const PIXELS_PER_HOUR = 250;
const ROW_HEIGHT = 80;
const TIME_HEADER_HEIGHT = 44;
const CHANNELS_PER_PAGE = 20;
const MIN_PROGRAM_WIDTH = 80;
const HORIZONTAL_PADDING = 60;

// Channel label component
const ChannelLabel: React.FC<{
  channel: BaseItemDto;
  typography: ReturnType<typeof useScaledTVTypography>;
}> = ({ channel, typography }) => (
  <View style={styles.channelLabel}>
    <Text
      numberOfLines={1}
      style={[styles.channelNumber, { fontSize: typography.callout }]}
    >
      {channel.ChannelNumber}
    </Text>
    <Text
      numberOfLines={1}
      style={[styles.channelName, { fontSize: typography.callout }]}
    >
      {channel.Name}
    </Text>
  </View>
);

export const TVLiveTVGuide: React.FC = () => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const [currentPage, setCurrentPage] = useState(1);

  // Scroll refs for synchronization
  const channelListRef = useRef<ScrollView>(null);
  const mainVerticalRef = useRef<ScrollView>(null);

  // Focus guide refs for bidirectional navigation
  const [firstProgramRef, setFirstProgramRef] = useState<View | null>(null);
  const [prevButtonRef, setPrevButtonRef] = useState<View | null>(null);

  // Base time - start of current hour, end time - end of day
  const [{ baseTime, endOfDay, hoursToShow }] = useState(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);

    const endOfDayTime = new Date(now);
    endOfDayTime.setHours(23, 59, 59, 999);

    const hoursUntilEndOfDay = Math.ceil(
      (endOfDayTime.getTime() - now.getTime()) / (60 * 60 * 1000),
    );

    return {
      baseTime: now,
      endOfDay: endOfDayTime,
      hoursToShow: Math.max(hoursUntilEndOfDay, 1), // At least 1 hour
    };
  });

  // Current time indicator position (relative to program grid start)
  const [currentTimeOffset, setCurrentTimeOffset] = useState(0);

  // Update current time indicator every minute
  useEffect(() => {
    const updateCurrentTime = () => {
      const now = new Date();
      const diffMinutes = (now.getTime() - baseTime.getTime()) / 60000;
      const offset = (diffMinutes / 60) * PIXELS_PER_HOUR;
      setCurrentTimeOffset(offset);
    };

    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 60000);
    return () => clearInterval(interval);
  }, [baseTime]);

  // Sync vertical scroll between channel list and main grid
  const handleVerticalScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      channelListRef.current?.scrollTo({ y: offsetY, animated: false });
    },
    [],
  );

  // Fetch channels
  const { data: channelsData, isLoading: isLoadingChannels } = useQuery({
    queryKey: ["livetv", "tv-guide", "channels"],
    queryFn: async () => {
      if (!api || !user?.Id) return null;
      const res = await getLiveTvApi(api).getLiveTvChannels({
        enableFavoriteSorting: true,
        userId: user.Id,
        addCurrentProgram: false,
        enableUserData: false,
        enableImageTypes: ["Primary"],
      });
      return res.data;
    },
    enabled: !!api && !!user?.Id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const totalChannels = channelsData?.TotalRecordCount ?? 0;
  const totalPages = Math.ceil(totalChannels / CHANNELS_PER_PAGE);
  const allChannels = channelsData?.Items ?? [];

  // Get channels for current page
  const paginatedChannels = useMemo(() => {
    const startIndex = (currentPage - 1) * CHANNELS_PER_PAGE;
    return allChannels.slice(startIndex, startIndex + CHANNELS_PER_PAGE);
  }, [allChannels, currentPage]);

  const channelIds = useMemo(
    () => paginatedChannels.map((c) => c.Id).filter(Boolean) as string[],
    [paginatedChannels],
  );

  // Fetch programs for visible channels
  const { data: programsData, isLoading: isLoadingPrograms } = useQuery({
    queryKey: [
      "livetv",
      "tv-guide",
      "programs",
      channelIds,
      baseTime.toISOString(),
      endOfDay.toISOString(),
    ],
    queryFn: async () => {
      if (!api || channelIds.length === 0) return null;
      const res = await getLiveTvApi(api).getPrograms({
        getProgramsDto: {
          MaxStartDate: endOfDay.toISOString(),
          MinEndDate: baseTime.toISOString(),
          ChannelIds: channelIds,
          ImageTypeLimit: 1,
          EnableImages: false,
          SortBy: ["StartDate"],
          EnableTotalRecordCount: false,
          EnableUserData: false,
        },
      });
      return res.data;
    },
    enabled: channelIds.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const programs = programsData?.Items ?? [];

  // Group programs by channel
  const programsByChannel = useMemo(() => {
    const grouped: Record<string, BaseItemDto[]> = {};
    for (const program of programs) {
      const channelId = program.ChannelId;
      if (channelId) {
        if (!grouped[channelId]) {
          grouped[channelId] = [];
        }
        grouped[channelId].push(program);
      }
    }
    return grouped;
  }, [programs]);

  const handleProgramPress = useCallback(
    (program: BaseItemDto) => {
      // Navigate to play the program/channel
      const queryParams = new URLSearchParams({
        itemId: program.Id ?? "",
        audioIndex: "",
        subtitleIndex: "",
        mediaSourceId: "",
        bitrateValue: "",
      });
      router.push(`/player/direct-player?${queryParams.toString()}`);
    },
    [router],
  );

  const handlePreviousPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
    }
  }, [currentPage]);

  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage((p) => p + 1);
    }
  }, [currentPage, totalPages]);

  const isLoading = isLoadingChannels;
  const totalWidth = hoursToShow * PIXELS_PER_HOUR;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#FFFFFF' />
      </View>
    );
  }

  if (paginatedChannels.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { fontSize: typography.body }]}>
          {t("live_tv.no_programs")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Page Navigation */}
      {totalPages > 1 && (
        <View style={{ paddingHorizontal: insets.left + HORIZONTAL_PADDING }}>
          <TVGuidePageNavigation
            currentPage={currentPage}
            totalPages={totalPages}
            onPrevious={handlePreviousPage}
            onNext={handleNextPage}
            prevButtonRefSetter={setPrevButtonRef}
          />
        </View>
      )}

      {/* Bidirectional focus guides */}
      {firstProgramRef && (
        <TVFocusGuideView
          destinations={[firstProgramRef]}
          style={{ height: 1, width: "100%" }}
        />
      )}
      {prevButtonRef && (
        <TVFocusGuideView
          destinations={[prevButtonRef]}
          style={{ height: 1, width: "100%" }}
        />
      )}

      {/* Main grid container */}
      <View style={styles.gridWrapper}>
        {/* Fixed channel column */}
        <View
          style={[
            styles.channelColumn,
            {
              width: CHANNEL_COLUMN_WIDTH,
              marginLeft: insets.left + HORIZONTAL_PADDING,
            },
          ]}
        >
          {/* Spacer for time header */}
          <View style={{ height: TIME_HEADER_HEIGHT }} />

          {/* Channel labels - synced with main scroll */}
          <ScrollView
            ref={channelListRef}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
          >
            {paginatedChannels.map((channel, index) => (
              <ChannelLabel
                key={channel.Id ?? index}
                channel={channel}
                typography={typography}
              />
            ))}
          </ScrollView>
        </View>

        {/* Scrollable programs area */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalScroll}
          contentContainerStyle={{
            paddingRight: insets.right + HORIZONTAL_PADDING,
          }}
        >
          <View style={{ width: totalWidth, position: "relative" }}>
            {/* Time header */}
            <TVGuideTimeHeader
              baseTime={baseTime}
              hoursToShow={hoursToShow}
              pixelsPerHour={PIXELS_PER_HOUR}
            />

            {/* Programs grid - vertical scroll */}
            <ScrollView
              ref={mainVerticalRef}
              onScroll={handleVerticalScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
            >
              {paginatedChannels.map((channel, index) => {
                const channelPrograms = channel.Id
                  ? (programsByChannel[channel.Id] ?? [])
                  : [];
                return (
                  <TVGuideChannelRow
                    key={channel.Id ?? index}
                    programs={channelPrograms}
                    baseTime={baseTime}
                    pixelsPerHour={PIXELS_PER_HOUR}
                    minProgramWidth={MIN_PROGRAM_WIDTH}
                    hoursToShow={hoursToShow}
                    onProgramPress={handleProgramPress}
                    firstProgramRefSetter={
                      index === 0 ? setFirstProgramRef : undefined
                    }
                  />
                );
              })}
            </ScrollView>

            {/* Current time indicator */}
            {currentTimeOffset > 0 && currentTimeOffset < totalWidth && (
              <View
                style={[
                  styles.currentTimeIndicator,
                  {
                    left: currentTimeOffset,
                    top: 0,
                    height:
                      TIME_HEADER_HEIGHT +
                      paginatedChannels.length * ROW_HEIGHT,
                  },
                ]}
              />
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.6)",
  },
  gridWrapper: {
    flex: 1,
    flexDirection: "row",
  },
  channelColumn: {
    backgroundColor: "rgba(40, 40, 40, 1)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.2)",
  },
  channelLabel: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.2)",
  },
  channelNumber: {
    color: "rgba(255, 255, 255, 0.5)",
    fontWeight: "400",
    marginBottom: 2,
  },
  channelName: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  horizontalScroll: {
    flex: 1,
  },
  currentTimeIndicator: {
    position: "absolute",
    width: 2,
    backgroundColor: "#EF4444",
    zIndex: 10,
    pointerEvents: "none",
  },
});
