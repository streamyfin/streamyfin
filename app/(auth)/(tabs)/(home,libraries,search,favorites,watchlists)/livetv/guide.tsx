import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { useFocusEffect, useSegments } from "expo-router";
import { useAtom } from "jotai";
import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  InteractionManager,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { itemRouter } from "@/components/common/TouchableItemRouter";
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
import useRouter from "@/hooks/useAppRouter";
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

const ChannelLogoButton: React.FC<{
  channel: BaseItemDto;
}> = ({ channel }) => {
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorite(channel);
  const showFavoriteSheet = useChannelFavoriteSheet();

  const handlePress = useCallback(() => {
    router.push(
      `/player/direct-player?itemId=${channel.Id}&audioIndex=0&subtitleIndex=-1&mediaSourceId=&bitrateValue=&playbackPosition=0&offline=false`,
    );
  }, [channel.Id, router]);

  const handleLongPress = useCallback(() => {
    showFavoriteSheet(channel, !!isFavorite, toggleFavorite);
  }, [showFavoriteSheet, channel, isFavorite, toggleFavorite]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole='button'
      accessibilityLabel={channel.Name ?? undefined}
      style={{ width: CHANNEL_COL_WIDTH, height: ROW_HEIGHT }}
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
    </TouchableOpacity>
  );
};

const MemoizedChannelLogoButton = React.memo(ChannelLogoButton);

const GuideRowWithFavorite: React.FC<{
  channel: BaseItemDto;
  programs: BaseItemDto[] | null;
  scrollXShared: SharedValue<number>;
  referenceTime: Date;
  nowMs: number;
}> = ({ channel, programs, scrollXShared, referenceTime, nowMs }) => {
  const router = useRouter();
  const segments = useSegments();

  const handlePress = useCallback(() => {
    router.push(
      `/player/direct-player?itemId=${channel.Id}&audioIndex=0&subtitleIndex=-1&mediaSourceId=&bitrateValue=&playbackPosition=0&offline=false`,
    );
  }, [channel.Id, router]);

  const handleLongPress = useCallback(
    (item: BaseItemDto) => {
      const from = (segments as string[])[2] || "(home)";
      router.push(itemRouter(item, from) as any);
    },
    [router, segments],
  );

  return (
    <MemoizedLiveTVGuideRow
      channel={channel}
      programs={programs}
      scrollXShared={scrollXShared}
      referenceTime={referenceTime}
      nowMs={nowMs}
      onPress={handlePress}
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
  referenceTime: Date;
  nowMs: number;
}> = ({ channel, programs, scrollXShared, referenceTime, nowMs }) => {
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
      referenceTime={referenceTime}
      nowMs={nowMs}
    />
  );
};

const MemoizedDeferredGuideRow = React.memo(DeferredGuideRow);

// useQueries returns a new array on every render; a combined result is
// structurally shared, so the map below rebuilds only when programs change.
const programWindowData = (results: { data?: BaseItemDto[] }[]) =>
  results.map((result) => result.data);

export default function LiveTvGuidePage() {
  const { t } = useTranslation();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // The root pads by the horizontal safe-area insets (landscape on a notched
  // device), so the guide gets the width between them.
  const viewportWidth =
    screenWidth - insets.left - insets.right - CHANNEL_COL_WIDTH;

  // The first visible row, not the raw offset: scroll events that stay within
  // a row don't re-render the page
  const [scrollRow, setScrollRow] = useState(0);

  // Tracks how many 6h time windows have been requested. It grows so the
  // loaded range reaches 2 hours past the visible right edge; a wide screen
  // needs more than one window before any scrolling. A ref mirrors the state
  // for use in the scroll handler without stale closure issues.
  const [loadedWindows, setLoadedWindows] = useState(1);
  const loadedWindowsRef = useRef(1);
  const loadWindowsUpTo = useCallback((rightEdge: number) => {
    const needed = Math.min(
      MAX_WINDOWS,
      Math.ceil(
        (rightEdge + 2 * EPG_PX_PER_HOUR) / (WINDOW_HOURS * EPG_PX_PER_HOUR),
      ),
    );
    if (needed > loadedWindowsRef.current) {
      loadedWindowsRef.current = needed;
      setLoadedWindows(needed);
    }
  }, []);

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

      loadWindowsUpTo(x + viewportWidth);
    },
    [scrollXShared, loadWindowsUpTo, viewportWidth],
  );

  // Before any scrolling, and after a rotation widens the view.
  useEffect(() => {
    loadWindowsUpTo(scrollXShared.value + viewportWidth);
  }, [loadWindowsUpTo, viewportWidth, scrollXShared]);

  const scrollToStart = useCallback(() => {
    scrollXShared.value = 0;
    headerScrollRef.current?.scrollTo({ x: 0, animated: true });
    contentScrollRef.current?.scrollTo({ x: 0, animated: true });
  }, [scrollXShared]);

  const guideContentWidth = 24 * EPG_PX_PER_HOUR;

  // The guide stays mounted with its tab, so the reference moves along with
  // the clock; the program queries are keyed by it and load the new window.
  const [referenceTime, setReferenceTime] = useState(getGuideReferenceTime);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      const syncClock = () => {
        setNowMs(Date.now());
        const next = getGuideReferenceTime();
        setReferenceTime((prev) =>
          prev.getTime() === next.getTime() ? prev : next,
        );
      };
      syncClock();
      const interval = setInterval(syncClock, 60_000);
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

  // Positioned from the root's padding edge, so it starts after the left inset.
  const channelColumnEdge = insets.left + CHANNEL_COL_WIDTH;
  const nowIndicatorStyle = useAnimatedStyle(() => {
    const left = channelColumnEdge + nowPosition - scrollXShared.value;
    return {
      left,
      opacity: left >= channelColumnEdge ? 1 : 0,
    };
  });

  const {
    data: channelPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingChannels,
    isError: isChannelsError,
    isSuccess: isChannelsSuccess,
    refetch: refetchChannels,
  } = useInfiniteQuery({
    queryKey: ["livetv", "guide", "channels", user?.Id],
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
    // The page can mount before the api and the user are restored; the
    // channels carry the user's favorites.
    enabled: !!api && !!user?.Id,
  });

  // Without cached channels a failed request would leave an empty guide
  const channelsFailed = isChannelsError && !channelPages;
  // Only a successful response can say there are none: the query is disabled
  // while the api and the user are restored
  const noChannels =
    isChannelsSuccess && (channelPages.pages[0]?.Items?.length ?? 0) === 0;

  const [allChannels, setAllChannels] = useState<BaseItemDto[]>([]);

  useEffect(() => {
    startTransition(() => {
      setAllChannels(channelPages?.pages.flatMap((p) => p.Items ?? []) ?? []);
    });
  }, [channelPages]);

  // One query per (channel page × time window), loaded on demand.
  const programWindows = useQueries({
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
          queryKey: [
            "livetv",
            "guide",
            "programs",
            channelIds,
            windowIndex,
            referenceTime.getTime(),
          ],
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
          // The channels can come back from the persisted cache before the api does.
          enabled: !!api && channelIds.length > 0,
          staleTime: 2 * 60 * 1000,
        };
      });
    }),
    combine: programWindowData,
  });

  // Merge programs from all windows into a per-channel map; deduplicate by ID
  // since long-running programs can span multiple windows.
  // Uses startTransition so the JS thread yields to touch events (e.g. tab switches)
  // before rebuilding the map.
  const [programsByChannel, setProgramsByChannel] = useState(
    () => new Map<string, BaseItemDto[]>(),
  );

  useEffect(() => {
    // A new reference time re-keys every window: keep the previous map until
    // one of the new windows has data, or every row blanks while they load.
    if (
      programWindows.length > 0 &&
      programWindows.every((programs) => programs === undefined)
    ) {
      return;
    }
    startTransition(() => {
      const map = new Map<string, BaseItemDto[]>();
      const seen = new Set<string>();
      for (const programs of programWindows) {
        for (const p of programs ?? []) {
          if (!p.ChannelId || !p.Id || seen.has(p.Id)) continue;
          seen.add(p.Id);
          if (!map.has(p.ChannelId)) map.set(p.ChannelId, []);
          map.get(p.ChannelId)!.push(p);
        }
      }
      setProgramsByChannel(map);
    });
  }, [programWindows]);

  const visibleStart = Math.max(0, scrollRow - BUFFER_ROWS);
  const visibleEnd = Math.min(
    allChannels.length - 1,
    scrollRow + Math.ceil(screenHeight / ROW_HEIGHT) + 1 + BUFFER_ROWS,
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
      setScrollRow(Math.floor(y / ROW_HEIGHT));
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
          accessibilityRole='button'
          accessibilityLabel={t("live_tv.go_to_now")}
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
          <HourHeader height={HOUR_HEIGHT} referenceTime={referenceTime} />
        </ScrollView>
      </View>

      {isLoadingChannels && (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size='large' />
        </View>
      )}

      {channelsFailed && (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text className='text-neutral-400'>
            {t("live_tv.channels_load_failed")}
          </Text>
          <TouchableOpacity
            onPress={() => refetchChannels()}
            accessibilityRole='button'
            className='mt-4 px-6 py-3 rounded-xl bg-purple-600'
          >
            <Text className='font-bold'>{t("home.retry")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {noChannels && (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text className='text-neutral-400'>{t("live_tv.no_channels")}</Text>
        </View>
      )}

      {!isLoadingChannels && !channelsFailed && !noChannels && (
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
                  <MemoizedChannelLogoButton channel={c} />
                </View>
              ))}
            </View>

            <ScrollView
              ref={contentScrollRef}
              nestedScrollEnabled
              horizontal
              style={{ width: viewportWidth }}
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
                      referenceTime={referenceTime}
                      nowMs={nowMs}
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
