import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { useAtom } from "jotai";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { EPG_PX_PER_HOUR } from "@/components/livetv/constants";
import { HourHeader } from "@/components/livetv/HourHeader";
import { LiveTVGuideRow } from "@/components/livetv/LiveTVGuideRow";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const HOUR_HEIGHT = 30;
const HEADER_GAP = 8;
const DOT_SIZE = 9;
const CHANNELS_PER_PAGE = 50;
const BUFFER_ROWS = 5;
const CHANNEL_COL_WIDTH = 64;

function makeSyncScrollHandler(
  selfLock: React.MutableRefObject<boolean>,
  otherLock: React.MutableRefObject<boolean>,
  otherRef: React.MutableRefObject<ScrollView | null>,
  setX: (x: number) => void,
) {
  return (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const x = e.nativeEvent.contentOffset.x;
    setX(x);
    if (selfLock.current) {
      selfLock.current = false;
      return;
    }
    otherLock.current = true;
    otherRef.current?.scrollTo({ x, animated: false });
  };
}

const MemoizedLiveTVGuideRow = React.memo(LiveTVGuideRow);

export default function page() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width;
  const screenHeight = Dimensions.get("window").height;

  const [scrollY, setScrollY] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const headerScrollRef = useRef<ScrollView>(null);
  const contentScrollRef = useRef<ScrollView>(null);
  // Prevent sync feedback loops between the two ScrollViews
  const syncingHeader = useRef(false);
  const syncingContent = useRef(false);

  const handleHeaderScroll = useMemo(
    () =>
      makeSyncScrollHandler(
        syncingHeader,
        syncingContent,
        contentScrollRef,
        setScrollX,
      ),
    [],
  );

  const handleContentXScroll = useMemo(
    () =>
      makeSyncScrollHandler(
        syncingContent,
        syncingHeader,
        headerScrollRef,
        setScrollX,
      ),
    [],
  );

  // Total width of guide content: hours remaining today × pixels per hour
  const guideContentWidth = useMemo(() => {
    const hoursRemaining = 24 - new Date().getHours();
    return hoursRemaining * EPG_PX_PER_HOUR;
  }, []);

  // Pixel offset of current time from the start of the current hour.
  // Computed inline (not memoized) so it stays accurate across re-renders.
  const now = new Date();
  const nowPosition =
    ((now.getMinutes() * 60 + now.getSeconds()) / 3600) * EPG_PX_PER_HOUR;

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
      {/* Fixed hour header — scrollable, synced with content */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: "black",
          marginLeft: CHANNEL_COL_WIDTH,
        }}
      >
        <ScrollView
          ref={headerScrollRef}
          horizontal
          scrollEventThrottle={16}
          onScroll={handleHeaderScroll}
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          style={{ flex: 1 }}
        >
          <HourHeader height={HOUR_HEIGHT} />
        </ScrollView>
      </View>

      {/* Vertical scroll — channel images + program rows */}
      <ScrollView
        contentInsetAdjustmentBehavior='never'
        scrollEventThrottle={16}
        onScroll={handleScroll}
        style={{ marginTop: HEADER_GAP }}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: CHANNEL_COL_WIDTH }}>
            {allChannels.map((c) => {
              const currentProgram = (programsByChannel.get(c.Id!) ?? []).find(
                (p) =>
                  p.StartDate &&
                  p.EndDate &&
                  now >= new Date(p.StartDate) &&
                  now <= new Date(p.EndDate),
              );
              return (
                <TouchableItemRouter
                  key={c.Id}
                  item={currentProgram ?? c}
                  style={{ width: CHANNEL_COL_WIDTH }}
                  className='h-16 rounded-lg overflow-hidden'
                >
                  <ItemImage
                    style={{ width: "100%", height: "100%" }}
                    contentFit='contain'
                    item={c}
                  />
                </TouchableItemRouter>
              );
            })}
          </View>

          <ScrollView
            ref={contentScrollRef}
            nestedScrollEnabled
            horizontal
            style={{ width: screenWidth - CHANNEL_COL_WIDTH }}
            scrollEventThrottle={16}
            onScroll={handleContentXScroll}
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

      {/* Now indicator: only visible while current time is within guide view */}
      {nowPosition >= scrollX && (
        <View
          pointerEvents='none'
          style={{
            position: "absolute",
            left: CHANNEL_COL_WIDTH + nowPosition - scrollX,
            top: HOUR_HEIGHT + HEADER_GAP,
            bottom: 0,
            width: 1,
            backgroundColor: "rgba(255, 255, 255, 0.3)",
          }}
        >
          <View
            style={{
              position: "absolute",
              top: -(HEADER_GAP + DOT_SIZE / 2),
              left: -(DOT_SIZE / 2),
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: 5,
              backgroundColor: "rgba(255, 255, 255, 0.75)",
            }}
          />
        </View>
      )}
    </View>
  );
}
