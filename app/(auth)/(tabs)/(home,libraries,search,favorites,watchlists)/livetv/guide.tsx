import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useAtom } from "jotai";
import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { useChannelFavoriteSheet } from "@/components/livetv/ChannelFavoriteSheet";
import {
  EPG_FAVORITE_ICON_SIZE,
  EPG_HEADER_BG,
  EPG_NOW_INDICATOR_DOT,
  EPG_NOW_INDICATOR_LINE,
  EPG_PX_PER_HOUR,
  getGuideReferenceTime,
} from "@/components/livetv/constants";
import { HourHeader } from "@/components/livetv/HourHeader";
import { LiveTVGuideRow } from "@/components/livetv/LiveTVGuideRow";
import { Colors } from "@/constants/Colors";
import { useFavorite } from "@/hooks/useFavorite";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const HOUR_HEIGHT = 30;
const HEADER_GAP = 8;
const DOT_SIZE = 9;
const ROW_HEIGHT = 64;
const CHANNELS_PER_PAGE = 50;
const BUFFER_ROWS = 6;
const CHANNEL_COL_WIDTH = 64;

// Programs are fetched in 6-hour windows and loaded on demand as the user
// scrolls right. Loading starts 2 hours before the window boundary.
const WINDOW_HOURS = 6;
const MAX_WINDOWS = Math.ceil(24 / WINDOW_HOURS); // 4

function makeSyncScrollHandler(
  selfLock: React.MutableRefObject<boolean>,
  otherLock: React.MutableRefObject<boolean>,
  otherRef: React.MutableRefObject<ScrollView | null>,
  scrollXShared: SharedValue<number>,
) {
  return (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const x = e.nativeEvent.contentOffset.x;
    scrollXShared.value = x;
    if (selfLock.current) {
      selfLock.current = false;
      return;
    }
    otherLock.current = true;
    otherRef.current?.scrollTo({ x, animated: false });
  };
}

const MemoizedLiveTVGuideRow = React.memo(LiveTVGuideRow);

// Lightweight — reads isFavorite directly from channel data to avoid the
// expensive useFavorite hook (useMutation + useEffects) in every visible row.
// Long-press favorite toggle is available on the guide row to the right.
const ChannelLogoButton: React.FC<{
  channel: BaseItemDto;
}> = ({ channel }) => {
  const isFavorite = channel.UserData?.IsFavorite ?? false;

  return (
    <TouchableItemRouter
      item={channel}
      style={{ width: CHANNEL_COL_WIDTH }}
      className='h-16'
    >
      <View style={{ width: "100%", height: "100%" }}>
        <ItemImage
          style={{ width: "100%", height: "100%" }}
          contentFit='contain'
          item={channel}
        />
        {isFavorite && (
          <View style={{ position: "absolute", bottom: 3, right: 3 }}>
            <Ionicons
              name='heart'
              size={EPG_FAVORITE_ICON_SIZE}
              color={Colors.primary}
            />
          </View>
        )}
      </View>
    </TouchableItemRouter>
  );
};

const GuideRowWithFavorite: React.FC<{
  channel: BaseItemDto;
  programs: BaseItemDto[] | null;
  scrollXShared: SharedValue<number>;
}> = ({ channel, programs, scrollXShared }) => {
  const { isFavorite, toggleFavorite } = useFavorite(channel);
  const showFavoriteSheet = useChannelFavoriteSheet();

  const handleLongPress = useCallback(() => {
    showFavoriteSheet(channel, !!isFavorite, toggleFavorite);
  }, [showFavoriteSheet, channel, isFavorite, toggleFavorite]);

  return (
    <MemoizedLiveTVGuideRow
      channel={channel}
      programs={programs}
      scrollXShared={scrollXShared}
      onLongPress={handleLongPress}
    />
  );
};

const MemoizedGuideRowWithFavorite = React.memo(GuideRowWithFavorite);

// While scrolling, only the logo column is visible. EPG content mounts as a
// cheap placeholder and renders its full content once interactions settle.
// A 400 ms fallback ensures content appears even during the initial navigation
// (where the navigation animation itself counts as an active interaction).
const DeferredGuideRow: React.FC<{
  channel: BaseItemDto;
  programs: BaseItemDto[] | null;
  scrollXShared: SharedValue<number>;
}> = ({ channel, programs, scrollXShared }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    const fallback = setTimeout(() => setReady(true), 400);
    return () => {
      task.cancel();
      clearTimeout(fallback);
    };
  }, []);

  if (!ready) return <View style={{ height: ROW_HEIGHT }} />;

  return (
    <MemoizedGuideRowWithFavorite
      channel={channel}
      programs={programs}
      scrollXShared={scrollXShared}
    />
  );
};

const MemoizedDeferredGuideRow = React.memo(DeferredGuideRow);

export default function page() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width;
  const screenHeight = Dimensions.get("window").height;

  const [scrollY, setScrollY] = useState(0);

  // Tracks how many 6h time windows have been requested. Starts at 1 and grows
  // as the user scrolls right. A ref mirrors the state for use in the scroll
  // handler without stale closure issues.
  const [loadedWindows, setLoadedWindows] = useState(1);
  const loadedWindowsRef = useRef(1);

  const scrollXShared = useSharedValue(0);
  const isFocused = useRef(true);

  const headerScrollRef = useRef<ScrollView>(null);
  const contentScrollRef = useRef<ScrollView>(null);
  const syncingHeader = useRef(false);
  const syncingContent = useRef(false);

  const handleHeaderScroll = useMemo(
    () =>
      makeSyncScrollHandler(
        syncingHeader,
        syncingContent,
        contentScrollRef,
        scrollXShared,
      ),
    // scrollXShared is a stable ref from useSharedValue
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Horizontal content scroll: syncs header + triggers next time window when
  // the user is 2 hours away from the current data boundary.
  const handleContentXScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      if (!isFocused.current) return;
      const x = e.nativeEvent.contentOffset.x;
      scrollXShared.value = x;

      if (syncingContent.current) {
        syncingContent.current = false;
      } else {
        syncingHeader.current = true;
        headerScrollRef.current?.scrollTo({ x, animated: false });
      }

      const threshold =
        (loadedWindowsRef.current * WINDOW_HOURS - 2) * EPG_PX_PER_HOUR;
      if (x > threshold && loadedWindowsRef.current < MAX_WINDOWS) {
        loadedWindowsRef.current += 1;
        setLoadedWindows(loadedWindowsRef.current);
      }
    },
    [scrollXShared],
  );

  const scrollToStart = useCallback(() => {
    scrollXShared.value = 0;
    headerScrollRef.current?.scrollTo({ x: 0, animated: true });
    contentScrollRef.current?.scrollTo({ x: 0, animated: true });
  }, [scrollXShared]);

  const guideContentWidth = 24 * EPG_PX_PER_HOUR;

  const referenceTime = useMemo(() => getGuideReferenceTime(), []);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      setNowMs(Date.now());
      const interval = setInterval(() => setNowMs(Date.now()), 60_000);
      return () => {
        isFocused.current = false;
        clearInterval(interval);
      };
    }, []),
  );

  const nowPosition = useMemo(
    () => ((nowMs - referenceTime.getTime()) / 3600000) * EPG_PX_PER_HOUR,
    [nowMs, referenceTime],
  );

  const nowIndicatorStyle = useAnimatedStyle(() => {
    const left = CHANNEL_COL_WIDTH + nowPosition - scrollXShared.value;
    return {
      left,
      opacity: left >= CHANNEL_COL_WIDTH ? 1 : 0,
    };
  });

  const {
    data: channelPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingChannels,
  } = useInfiniteQuery({
    queryKey: ["livetv", "guide", "channels"],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await getLiveTvApi(api!).getLiveTvChannels({
        startIndex: pageParam,
        limit: CHANNELS_PER_PAGE,
        enableFavoriteSorting: true,
        userId: user?.Id,
        addCurrentProgram: false,
        enableUserData: true,
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
    staleTime: 3 * 60 * 1000,
  });

  const [allChannels, setAllChannels] = useState<BaseItemDto[]>([]);

  useEffect(() => {
    startTransition(() => {
      setAllChannels(channelPages?.pages.flatMap((p) => p.Items ?? []) ?? []);
    });
  }, [channelPages]);

  // One query per (channel page × time window), loaded on demand.
  const programQueries = useQueries({
    queries: (channelPages?.pages ?? []).flatMap((page) => {
      const channelIds = (page.Items ?? []).map((c) => c.Id!).filter(Boolean);
      return Array.from({ length: loadedWindows }, (_, windowIndex) => {
        const windowStart = new Date(
          referenceTime.getTime() + windowIndex * WINDOW_HOURS * 3600000,
        );
        const windowEnd = new Date(
          referenceTime.getTime() + (windowIndex + 1) * WINDOW_HOURS * 3600000,
        );
        return {
          queryKey: ["livetv", "guide", "programs", channelIds, windowIndex],
          queryFn: async () => {
            const res = await getLiveTvApi(api!).getPrograms({
              getProgramsDto: {
                ChannelIds: channelIds,
                MinEndDate: windowStart.toISOString(),
                MaxStartDate: windowEnd.toISOString(),
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
          staleTime: 2 * 60 * 1000,
        };
      });
    }),
  });

  // Merge programs from all windows into a per-channel map; deduplicate by ID
  // since long-running programs can span multiple windows.
  // Uses startTransition so the JS thread yields to touch events (e.g. tab switches)
  // before rebuilding the map.
  const [programsByChannel, setProgramsByChannel] = useState(
    () => new Map<string, BaseItemDto[]>(),
  );

  useEffect(() => {
    startTransition(() => {
      const map = new Map<string, BaseItemDto[]>();
      const seen = new Set<string>();
      for (const query of programQueries) {
        for (const p of query.data ?? []) {
          if (!p.ChannelId || !p.Id || seen.has(p.Id)) continue;
          seen.add(p.Id);
          if (!map.has(p.ChannelId)) map.set(p.ChannelId, []);
          map.get(p.ChannelId)!.push(p);
        }
      }
      setProgramsByChannel(map);
    });
  }, [programQueries]);

  const visibleStart = Math.max(
    0,
    Math.floor(scrollY / ROW_HEIGHT) - BUFFER_ROWS,
  );
  const visibleEnd = Math.min(
    allChannels.length - 1,
    Math.ceil((scrollY + screenHeight) / ROW_HEIGHT) + BUFFER_ROWS,
  );
  const visibleChannels = useMemo(
    () => allChannels.slice(visibleStart, visibleEnd + 1),
    [allChannels, visibleStart, visibleEnd],
  );
  const totalListHeight = allChannels.length * ROW_HEIGHT;

  const handleScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      if (!isFocused.current) return;
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
          backgroundColor: EPG_HEADER_BG,
        }}
      >
        <TouchableOpacity
          onPress={scrollToStart}
          style={{
            width: CHANNEL_COL_WIDTH,
            height: HOUR_HEIGHT,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name='locate-outline' size={16} color='white' />
        </TouchableOpacity>
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

      {isLoadingChannels && (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size='large' />
        </View>
      )}

      {!isLoadingChannels && (
        <ScrollView
          contentInsetAdjustmentBehavior='never'
          scrollEventThrottle={100}
          onScroll={handleScroll}
          style={{ marginTop: HEADER_GAP }}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          <View style={{ flexDirection: "row", height: totalListHeight }}>
            <View style={{ width: CHANNEL_COL_WIDTH }}>
              {visibleChannels.map((c, idx) => (
                <View
                  key={c.Id}
                  style={{
                    position: "absolute",
                    top: (visibleStart + idx) * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                  }}
                >
                  <ChannelLogoButton channel={c} />
                </View>
              ))}
            </View>

            <ScrollView
              ref={contentScrollRef}
              nestedScrollEnabled
              horizontal
              style={{ width: screenWidth - CHANNEL_COL_WIDTH }}
              scrollEventThrottle={16}
              onScroll={handleContentXScroll}
            >
              <View
                style={{ width: guideContentWidth, height: totalListHeight }}
              >
                {visibleChannels.map((c, idx) => (
                  <View
                    key={c.Id}
                    style={{
                      position: "absolute",
                      top: (visibleStart + idx) * ROW_HEIGHT,
                      left: 0,
                      right: 0,
                      height: ROW_HEIGHT,
                    }}
                  >
                    <MemoizedDeferredGuideRow
                      channel={c}
                      programs={programsByChannel.get(c.Id!) ?? null}
                      scrollXShared={scrollXShared}
                    />
                  </View>
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
      )}

      <Animated.View
        pointerEvents='none'
        style={[
          {
            position: "absolute",
            top: HOUR_HEIGHT + HEADER_GAP,
            bottom: 0,
            width: 1,
            backgroundColor: EPG_NOW_INDICATOR_LINE,
          },
          nowIndicatorStyle,
        ]}
      >
        <View
          style={{
            position: "absolute",
            top: -(HEADER_GAP + DOT_SIZE / 2),
            left: -(DOT_SIZE / 2),
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: 5,
            backgroundColor: EPG_NOW_INDICATOR_DOT,
          }}
        />
      </Animated.View>
    </View>
  );
}
