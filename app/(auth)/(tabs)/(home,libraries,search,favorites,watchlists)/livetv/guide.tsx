import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { useAtom } from "jotai";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { HourHeader } from "@/components/livetv/HourHeader";
import { LiveTVGuideRow } from "@/components/livetv/LiveTVGuideRow";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const HOUR_HEIGHT = 30;
const CHANNELS_PER_PAGE = 50;
const BUFFER_ROWS = 5;
const CHANNEL_COL_WIDTH = 64;
const EPG_PX_PER_HOUR = 200;

const MemoizedLiveTVGuideRow = React.memo(LiveTVGuideRow);

export default function page() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width;
  const screenHeight = Dimensions.get("window").height;

  const [scrollY, setScrollY] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  // Total width of guide content: hours remaining today × pixels per hour
  const guideContentWidth = useMemo(() => {
    const hoursRemaining = 24 - new Date().getHours();
    return hoursRemaining * EPG_PX_PER_HOUR;
  }, []);

  const {
    data: channelPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["livetv", "guide", "channels"],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await getLiveTvApi(api!).getLiveTvChannels({
        startIndex: pageParam,
        limit: CHANNELS_PER_PAGE,
        enableFavoriteSorting: true,
        userId: user?.Id,
        addCurrentProgram: false,
        enableUserData: false,
        enableImageTypes: ["Primary"],
      });
      return res.data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.reduce(
        (sum, p) => sum + (p.Items?.length ?? 0),
        0,
      );
      if ((lastPage.Items?.length ?? 0) < CHANNELS_PER_PAGE) return undefined;
      return totalLoaded;
    },
  });

  const allChannels = useMemo(
    () => channelPages?.pages.flatMap((p) => p.Items ?? []) ?? [],
    [channelPages],
  );

  // One program query per channel page, independently cached
  const programQueries = useQueries({
    queries: (channelPages?.pages ?? []).map((page) => {
      const channelIds = (page.Items ?? []).map((c) => c.Id!).filter(Boolean);
      return {
        queryKey: ["livetv", "guide", "programs", channelIds],
        queryFn: async () => {
          const now = new Date();
          const endOfDay = new Date();
          endOfDay.setHours(23, 59, 59, 999);
          const res = await getLiveTvApi(api!).getPrograms({
            getProgramsDto: {
              ChannelIds: channelIds,
              MaxStartDate: endOfDay.toISOString(),
              MinEndDate: now.toISOString(),
              ImageTypeLimit: 1,
              EnableImages: false,
              SortBy: ["StartDate"],
              EnableTotalRecordCount: false,
              EnableUserData: false,
            },
          });
          return res.data.Items ?? [];
        },
        enabled: channelIds.length > 0,
      };
    }),
  });

  // Group all programs by channelId for O(1) lookup per row
  const programsByChannel = useMemo(() => {
    const map = new Map<string, BaseItemDto[]>();
    for (const query of programQueries) {
      for (const p of query.data ?? []) {
        if (!p.ChannelId) continue;
        if (!map.has(p.ChannelId)) map.set(p.ChannelId, []);
        map.get(p.ChannelId)!.push(p);
      }
    }
    return map;
  }, [programQueries]);

  const visibleStart = Math.max(0, Math.floor(scrollY / 64) - BUFFER_ROWS);
  const visibleEnd = Math.ceil((scrollY + screenHeight) / 64) + BUFFER_ROWS;

  const handleScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const y = e.nativeEvent.contentOffset.y;
      setScrollY(y);
      const { height: contentHeight } = e.nativeEvent.contentSize;
      const { height: layoutHeight } = e.nativeEvent.layoutMeasurement;
      if (
        contentHeight - (y + layoutHeight) < layoutHeight &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  return (
    <View
      style={{
        flex: 1,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {/* Fixed hour header — lives outside the ScrollView so it never scrolls away */}
      <View style={{ flexDirection: "row", backgroundColor: "black" }}>
        <View
          style={{ width: CHANNEL_COL_WIDTH, height: HOUR_HEIGHT }}
          className='bg-neutral-800'
        />
        <View style={{ flex: 1, overflow: "hidden" }}>
          <View style={{ transform: [{ translateX: -scrollX }] }}>
            <HourHeader height={HOUR_HEIGHT} />
          </View>
        </View>
      </View>

      {/* Vertical scroll — channel images + program rows */}
      <ScrollView
        contentInsetAdjustmentBehavior='never'
        scrollEventThrottle={16}
        onScroll={handleScroll}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: CHANNEL_COL_WIDTH }}>
            {allChannels.map((c) => (
              <View
                key={c.Id}
                style={{ width: CHANNEL_COL_WIDTH }}
                className='h-16 rounded-lg overflow-hidden'
              >
                <ItemImage
                  style={{ width: "100%", height: "100%" }}
                  contentFit='contain'
                  item={c}
                />
              </View>
            ))}
          </View>

          <ScrollView
            nestedScrollEnabled
            horizontal
            style={{ width: screenWidth - CHANNEL_COL_WIDTH }}
            scrollEventThrottle={16}
            onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
          >
            <View style={{ width: guideContentWidth }}>
              {allChannels.map((c, i) => (
                <MemoizedLiveTVGuideRow
                  key={c.Id}
                  channel={c}
                  programs={programsByChannel.get(c.Id!) ?? null}
                  scrollX={scrollX}
                  isVisible={i >= visibleStart && i <= visibleEnd}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        {isFetchingNextPage && (
          <View className='py-4 items-center'>
            <ActivityIndicator />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
