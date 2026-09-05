import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getItemsApi,
  getSuggestionsApi,
  getSystemApi,
  getTvShowsApi,
  getUserLibraryApi,
  getUserViewsApi,
} from "@jellyfin/sdk/lib/utils/api";
import { type QueryFunction, useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Image, prefetchServerImage } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { InfiniteScrollingCollectionList } from "@/components/home/InfiniteScrollingCollectionList.tv";
import { StreamystatsPromotedWatchlists } from "@/components/home/StreamystatsPromotedWatchlists.tv";
import { StreamystatsRecommendations } from "@/components/home/StreamystatsRecommendations.tv";
import { TVHeroCarousel } from "@/components/home/TVHeroCarousel";
import { Loader } from "@/components/Loader";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useRefreshLibraryOnFocus } from "@/hooks/useRefreshLibraryOnFocus";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import {
  apiAtom,
  cacheVersionAtom,
  userAtom,
} from "@/providers/JellyfinProvider";
import {
  AppleTVTopShelfContent,
  AppleTVTopShelfLayout,
  AppleTVTopShelfRecommendationsType,
  useSettings,
} from "@/utils/atoms/settings";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { scaleSize } from "@/utils/scaleSize";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import { updateTVDiscovery } from "@/utils/tvDiscovery/sync";

const HORIZONTAL_PADDING = scaleSize(60);
const TOP_PADDING = scaleSize(100);
// Generous gap between sections for Apple TV+ aesthetic
const SECTION_GAP = scaleSize(24);

type InfiniteScrollingCollectionListSection = {
  type: "InfiniteScrollingCollectionList";
  title?: string;
  queryKey: (string | undefined | null)[];
  queryFn: QueryFunction<BaseItemDto[], any, number>;
  orientation?: "horizontal" | "vertical";
  pageSize?: number;
  parentId?: string;
};

type Section = InfiniteScrollingCollectionListSection;

// Debounce delay in ms - prevents rapid backdrop changes when scrolling fast
const BACKDROP_DEBOUNCE_MS = 300;

export const Home = () => {
  const typography = useScaledTVTypography();
  const _router = useRouter();
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const cacheVersion = useAtomValue(cacheVersionAtom);
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const scrollRef = useRef<ScrollView>(null);
  const {
    isConnected,
    serverConnected,
    loading: retryLoading,
    retryCheck,
  } = useNetworkStatus();
  const _invalidateCache = useInvalidatePlaybackProgressCache();
  const { showItemActions } = useTVItemActionModal();

  // Fallback refresh for newly added content when returning to the home screen
  // (primary path is the LibraryChanged WebSocket event).
  useRefreshLibraryOnFocus();

  // Dynamic backdrop state with debounce
  const [focusedItem, setFocusedItem] = useState<BaseItemDto | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle item focus with debounce
  const handleItemFocus = useCallback((item: BaseItemDto) => {
    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    // Set new timer to update focused item after debounce delay
    debounceTimerRef.current = setTimeout(() => {
      setFocusedItem(item);
    }, BACKDROP_DEBOUNCE_MS);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Get backdrop URL from focused item (only if setting is enabled)
  const backdropUrl = useMemo(() => {
    if (!settings.showHomeBackdrop || !focusedItem) return null;
    return getBackdropUrl({
      api,
      item: focusedItem,
      quality: 90,
      width: 1920,
    });
  }, [api, focusedItem, settings.showHomeBackdrop]);

  // Crossfade animation for backdrop transitions
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [layer0Url, setLayer0Url] = useState<string | null>(null);
  const [layer1Url, setLayer1Url] = useState<string | null>(null);
  const layer0Opacity = useRef(new Animated.Value(0)).current;
  const layer1Opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!backdropUrl) return;

    let isCancelled = false;

    const performCrossfade = async () => {
      // Prefetch to disk only - the full-size 1920x1080 backdrop (~8MB
      // decoded ARGB) is too large to pin in the memory cache on every
      // focus change. Disk cache is fast enough for a 500ms crossfade.
      try {
        await prefetchServerImage(backdropUrl, api?.basePath, "disk");
      } catch {
        // Continue even if prefetch fails
      }

      if (isCancelled) return;

      // Determine which layer to fade in
      const incomingLayer = activeLayer === 0 ? 1 : 0;
      const incomingOpacity =
        incomingLayer === 0 ? layer0Opacity : layer1Opacity;
      const outgoingOpacity =
        incomingLayer === 0 ? layer1Opacity : layer0Opacity;

      // Set the new URL on the incoming layer
      if (incomingLayer === 0) {
        setLayer0Url(backdropUrl);
      } else {
        setLayer1Url(backdropUrl);
      }

      // Small delay to ensure image component has the new URL
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (isCancelled) return;

      // Crossfade: fade in the incoming layer, fade out the outgoing
      Animated.parallel([
        Animated.timing(incomingOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(outgoingOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!isCancelled) {
          setActiveLayer(incomingLayer);
        }
      });
    };

    performCrossfade();

    return () => {
      isCancelled = true;
    };
  }, [backdropUrl, api?.basePath]);

  const {
    data,
    isError: e1,
    isLoading: l1,
  } = useQuery({
    queryKey: ["home", "userViews", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) {
        return null;
      }

      const response = await getUserViewsApi(api).getUserViews({
        userId: user.Id,
      });

      return response.data.Items || null;
    },
    enabled: !!api && !!user?.Id,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Fetch hero items (Continue Watching + Next Up combined)
  const {
    data: heroItems,
    isLoading: heroItemsLoading,
    isError: heroItemsError,
  } = useQuery({
    queryKey: ["home", "heroItems", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const [resumeResponse, nextUpResponse] = await Promise.all([
        getItemsApi(api).getResumeItems({
          userId: user.Id,
          enableImageTypes: ["Primary", "Backdrop", "Thumb"],
          includeItemTypes: ["Movie", "Series", "Episode"],
          // MediaSources carries the MediaStreams used to derive Top Shelf
          // quality badges (4K / HDR / Atmos / CC); People carries the cast
          // used for the Top Shelf "Starring" attribute.
          fields: [
            "Overview",
            "Genres",
            "DateCreated",
            "MediaSources",
            "People",
          ],
          startIndex: 0,
          limit: 10,
        }),
        getTvShowsApi(api).getNextUp({
          userId: user.Id,
          startIndex: 0,
          limit: 10,
          // MediaSources carries the MediaStreams used to derive Top Shelf
          // quality badges (4K / HDR / Atmos / CC); People carries the cast
          // used for the Top Shelf "Starring" attribute.
          fields: [
            "Overview",
            "Genres",
            "DateCreated",
            "MediaSources",
            "People",
          ],
          enableImageTypes: ["Primary", "Backdrop", "Thumb"],
          enableResumable: false,
        }),
      ]);

      const resumeItems = resumeResponse.data.Items || [];
      const nextUpItems = nextUpResponse.data.Items || [];

      // Combine, sort by recent activity, and dedupe
      const combined = [...resumeItems, ...nextUpItems];
      const sorted = combined.sort((a, b) => {
        const dateA = a.UserData?.LastPlayedDate || a.DateCreated || "";
        const dateB = b.UserData?.LastPlayedDate || b.DateCreated || "";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      const seen = new Set<string>();
      const deduped: BaseItemDto[] = [];
      for (const item of sorted) {
        if (!item.Id || seen.has(item.Id)) continue;
        seen.add(item.Id);
        deduped.push(item);
      }

      return deduped.slice(0, 15);
    },
    enabled: !!api && !!user?.Id,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const topShelfContentPreset =
    settings.appleTvTopShelfContent || AppleTVTopShelfContent.ContinueAndNextUp;
  const topShelfLayout =
    settings.appleTvTopShelfLayout || AppleTVTopShelfLayout.Sectioned;

  const {
    data: topShelfContinueWatchingItems,
    isLoading: topShelfContinueWatchingLoading,
    isError: topShelfContinueWatchingError,
  } = useQuery({
    queryKey: ["topShelf", "continueWatching", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getItemsApi(api).getResumeItems({
        userId: user.Id,
        enableImageTypes: ["Primary", "Backdrop", "Thumb"],
        includeItemTypes: ["Movie", "Series", "Episode"],
        // MediaSources carries the MediaStreams used to derive Top Shelf
        // quality badges (4K / HDR / Atmos / CC); People carries the cast
        // used for the Top Shelf "Starring" attribute.
        fields: ["Overview", "Genres", "DateCreated", "MediaSources", "People"],
        startIndex: 0,
        limit: 12,
      });

      return response.data.Items || [];
    },
    enabled:
      !!api &&
      !!user?.Id &&
      topShelfContentPreset === AppleTVTopShelfContent.ContinueWatching,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const {
    data: topShelfNextUpItems,
    isLoading: topShelfNextUpLoading,
    isError: topShelfNextUpError,
  } = useQuery({
    queryKey: ["topShelf", "nextUp", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getTvShowsApi(api).getNextUp({
        userId: user.Id,
        startIndex: 0,
        limit: 12,
        // MediaSources carries the MediaStreams used to derive Top Shelf
        // quality badges (4K / HDR / Atmos / CC); People carries the cast
        // used for the Top Shelf "Starring" attribute.
        fields: ["Overview", "Genres", "DateCreated", "MediaSources", "People"],
        enableImageTypes: ["Primary", "Backdrop", "Thumb"],
        enableResumable: false,
      });

      return response.data.Items || [];
    },
    enabled:
      !!api &&
      !!user?.Id &&
      topShelfContentPreset === AppleTVTopShelfContent.NextUp,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const {
    data: topShelfRecentlyAddedItems,
    isLoading: topShelfRecentlyAddedLoading,
    isError: topShelfRecentlyAddedError,
  } = useQuery({
    queryKey: ["topShelf", "recentlyAdded", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      return (
        await getUserLibraryApi(api).getLatestMedia({
          userId: user.Id,
          limit: 12,
          fields: [
            "Overview",
            "PrimaryImageAspectRatio",
            "Genres",
            "DateCreated",
            // Needed to derive Top Shelf quality badges (4K / HDR / Atmos / CC).
            "MediaSources",
            // Needed for the Top Shelf "Starring" attribute.
            "People",
          ],
          imageTypeLimit: 1,
          enableImageTypes: ["Primary", "Backdrop", "Thumb"],
        })
      ).data;
    },
    enabled:
      !!api &&
      !!user?.Id &&
      topShelfContentPreset === AppleTVTopShelfContent.RecentlyAdded,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const topShelfRecommendationsType =
    settings.appleTvTopShelfRecommendationsType ||
    AppleTVTopShelfRecommendationsType.All;

  const {
    data: topShelfRecommendationsSection,
    isLoading: topShelfRecommendationsLoading,
    isError: topShelfRecommendationsError,
  } = useQuery({
    queryKey: [
      "topShelf",
      "recommendations",
      user?.Id,
      settings.streamyStatsServerUrl,
      topShelfRecommendationsType,
    ],
    queryFn: async () => {
      const title = t(
        "home.settings.appearance.apple_tv_top_shelf_content_recommendations",
      );

      if (
        !api ||
        !user?.Id ||
        !api.accessToken ||
        !settings.streamyStatsServerUrl
      ) {
        return { title, items: [] };
      }

      const serverInfo = await getSystemApi(api).getPublicSystemInfo();
      const jellyfinServerId = serverInfo.data.Id;
      if (!jellyfinServerId) {
        return { title, items: [] };
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const type =
        topShelfRecommendationsType === AppleTVTopShelfRecommendationsType.All
          ? undefined
          : topShelfRecommendationsType;

      const recommendationsResponse =
        await streamystatsApi.getRecommendationIds(jellyfinServerId, type, 12);
      const movies = recommendationsResponse.data?.movies || [];
      const series = recommendationsResponse.data?.series || [];

      // Interleave rather than concatenate so series don't get pushed to
      // the tail of the carousel behind every movie.
      const itemIds: string[] = [];
      const maxLength = Math.max(movies.length, series.length);
      for (let i = 0; i < maxLength; i++) {
        if (movies[i]) itemIds.push(movies[i]);
        if (series[i]) itemIds.push(series[i]);
      }
      const dedupedIds = Array.from(new Set(itemIds)).slice(0, 12);

      if (dedupedIds.length === 0) {
        return { title, items: [] };
      }

      const itemsResponse = await getItemsApi(api).getItems({
        userId: user.Id,
        ids: dedupedIds,
        fields: [
          "PrimaryImageAspectRatio",
          "Genres",
          "Overview",
          "DateCreated",
          // Needed to derive Top Shelf quality badges (4K / HDR / Atmos / CC).
          "MediaSources",
          // Needed for the Top Shelf "Starring" attribute.
          "People",
        ],
        enableImageTypes: ["Primary", "Backdrop", "Thumb"],
      });

      const itemsById = new Map(
        (itemsResponse.data.Items || []).map((item) => [item.Id, item]),
      );
      const orderedItems = dedupedIds
        .map((id) => itemsById.get(id))
        .filter((item): item is BaseItemDto => Boolean(item));

      return { title, items: orderedItems };
    },
    enabled:
      !!api &&
      !!user?.Id &&
      topShelfContentPreset === AppleTVTopShelfContent.Recommendations,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const topShelfSyncState = useMemo(() => {
    switch (topShelfContentPreset) {
      case AppleTVTopShelfContent.ContinueWatching:
        return {
          loading: topShelfContinueWatchingLoading,
          error: topShelfContinueWatchingError,
          sections: [
            {
              title: t("home.continue_watching"),
              items: topShelfContinueWatchingItems,
            },
          ],
        };
      case AppleTVTopShelfContent.NextUp:
        return {
          loading: topShelfNextUpLoading,
          error: topShelfNextUpError,
          sections: [
            {
              title: t("home.next_up"),
              items: topShelfNextUpItems,
            },
          ],
        };
      case AppleTVTopShelfContent.RecentlyAdded:
        return {
          loading: topShelfRecentlyAddedLoading,
          error: topShelfRecentlyAddedError,
          sections: [
            {
              title: t("home.recently_added"),
              items: topShelfRecentlyAddedItems,
            },
          ],
        };
      case AppleTVTopShelfContent.Recommendations:
        return {
          loading: topShelfRecommendationsLoading,
          error: topShelfRecommendationsError,
          sections: topShelfRecommendationsSection
            ? [topShelfRecommendationsSection]
            : [
                {
                  title: t(
                    "home.settings.appearance.apple_tv_top_shelf_content_recommendations",
                  ),
                  items: [],
                },
              ],
        };
      default:
        return {
          loading: heroItemsLoading,
          error: heroItemsError,
          sections: [
            {
              title: t("home.continue_and_next_up"),
              items: heroItems,
            },
          ],
        };
    }
  }, [
    heroItemsLoading,
    heroItemsError,
    heroItems,
    t,
    topShelfContentPreset,
    topShelfContinueWatchingItems,
    topShelfContinueWatchingLoading,
    topShelfContinueWatchingError,
    topShelfNextUpItems,
    topShelfNextUpLoading,
    topShelfNextUpError,
    topShelfRecentlyAddedItems,
    topShelfRecentlyAddedLoading,
    topShelfRecentlyAddedError,
    topShelfRecommendationsSection,
    topShelfRecommendationsLoading,
    topShelfRecommendationsError,
  ]);

  useEffect(() => {
    if (topShelfSyncState.loading || topShelfSyncState.error) {
      return;
    }

    updateTVDiscovery({
      api,
      sections: topShelfSyncState.sections,
      layout: topShelfLayout,
      contentPreset: topShelfContentPreset,
      useEpisodeImages: settings?.useEpisodeImagesForNextUp,
    });
  }, [
    api,
    topShelfSyncState,
    topShelfLayout,
    topShelfContentPreset,
    settings?.useEpisodeImagesForNextUp,
  ]);

  const userViews = useMemo(
    () => data?.filter((l) => !settings?.hiddenLibraries?.includes(l.Id!)),
    [data, settings?.hiddenLibraries],
  );

  const collections = useMemo(() => {
    const allow = ["movies", "tvshows"];
    return (
      userViews?.filter(
        (c) => c.CollectionType && allow.includes(c.CollectionType),
      ) || []
    );
  }, [userViews]);

  const createCollectionConfig = useCallback(
    (
      title: string,
      queryKey: string[],
      includeItemTypes: BaseItemKind[],
      parentId: string | undefined,
      pageSize = 10,
    ): InfiniteScrollingCollectionListSection => ({
      title,
      queryKey,
      queryFn: async ({ pageParam = 0 }) => {
        if (!api) return [];
        const allData =
          (
            await getUserLibraryApi(api).getLatestMedia({
              userId: user?.Id,
              limit: 10,
              fields: ["PrimaryImageAspectRatio"],
              imageTypeLimit: 1,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
              includeItemTypes,
              parentId,
            })
          ).data || [];

        return allData.slice(pageParam, pageParam + pageSize);
      },
      type: "InfiniteScrollingCollectionList",
      pageSize,
      parentId,
    }),
    [api, user?.Id],
  );

  const defaultSections = useMemo(() => {
    if (!api || !user?.Id) return [];

    const latestMediaViews = collections.map((c) => {
      const includeItemTypes: BaseItemKind[] =
        c.CollectionType === "tvshows" || c.CollectionType === "movies"
          ? []
          : ["Movie"];
      const title = t("home.recently_added_in", { libraryName: c.Name });
      const queryKey: string[] = [
        "home",
        `recentlyAddedIn${c.CollectionType}`,
        user.Id!,
        c.Id!,
      ];
      return createCollectionConfig(
        title || "",
        queryKey,
        includeItemTypes,
        c.Id,
        10,
      );
    });

    const sortByRecentActivity = (items: BaseItemDto[]): BaseItemDto[] => {
      return items.sort((a, b) => {
        const dateA = a.UserData?.LastPlayedDate || a.DateCreated || "";
        const dateB = b.UserData?.LastPlayedDate || b.DateCreated || "";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    };

    const deduplicateById = (items: BaseItemDto[]): BaseItemDto[] => {
      const seen = new Set<string>();
      return items.filter((item) => {
        if (!item.Id || seen.has(item.Id)) return false;
        seen.add(item.Id);
        return true;
      });
    };

    const firstSections: Section[] = settings.mergeNextUpAndContinueWatching
      ? [
          {
            title: t("home.continue_and_next_up"),
            queryKey: ["home", "continueAndNextUp"],
            queryFn: async ({ pageParam = 0 }) => {
              const [resumeResponse, nextUpResponse] = await Promise.all([
                getItemsApi(api).getResumeItems({
                  userId: user.Id,
                  enableImageTypes: ["Primary", "Backdrop", "Thumb"],
                  includeItemTypes: ["Movie", "Series", "Episode"],
                  startIndex: 0,
                  limit: 20,
                }),
                getTvShowsApi(api).getNextUp({
                  userId: user?.Id,
                  startIndex: 0,
                  limit: 20,
                  enableImageTypes: ["Primary", "Backdrop", "Thumb"],
                  enableResumable: false,
                }),
              ]);

              const resumeItems = resumeResponse.data.Items || [];
              const nextUpItems = nextUpResponse.data.Items || [];

              const combined = [...resumeItems, ...nextUpItems];
              const sorted = sortByRecentActivity(combined);
              const deduplicated = deduplicateById(sorted);

              return deduplicated.slice(pageParam, pageParam + 10);
            },
            type: "InfiniteScrollingCollectionList",
            orientation: "horizontal",
            pageSize: 10,
          },
        ]
      : [
          {
            title: t("home.continue_watching"),
            queryKey: ["home", "resumeItems"],
            queryFn: async ({ pageParam = 0 }) =>
              (
                await getItemsApi(api).getResumeItems({
                  userId: user.Id,
                  enableImageTypes: ["Primary", "Backdrop", "Thumb"],
                  includeItemTypes: ["Movie", "Series", "Episode"],
                  startIndex: pageParam,
                  limit: 10,
                })
              ).data.Items || [],
            type: "InfiniteScrollingCollectionList",
            orientation: "horizontal",
            pageSize: 10,
          },
          {
            title: t("home.next_up"),
            queryKey: ["home", "nextUp-all"],
            queryFn: async ({ pageParam = 0 }) =>
              (
                await getTvShowsApi(api).getNextUp({
                  userId: user?.Id,
                  startIndex: pageParam,
                  limit: 10,
                  enableImageTypes: ["Primary", "Backdrop", "Thumb"],
                  enableResumable: false,
                })
              ).data.Items || [],
            type: "InfiniteScrollingCollectionList",
            orientation: "horizontal",
            pageSize: 10,
          },
        ];

    const ss: Section[] = [
      ...firstSections,
      ...latestMediaViews,
      ...(!settings?.streamyStatsMovieRecommendations
        ? [
            {
              title: t("home.suggested_movies"),
              queryKey: ["home", "suggestedMovies", user?.Id],
              queryFn: async ({ pageParam = 0 }: { pageParam?: number }) =>
                (
                  await getSuggestionsApi(api).getSuggestions({
                    userId: user?.Id,
                    startIndex: pageParam,
                    limit: 10,
                    mediaType: ["Video"],
                    type: ["Movie"],
                  })
                ).data.Items || [],
              type: "InfiniteScrollingCollectionList" as const,
              orientation: "vertical" as const,
              pageSize: 10,
            },
          ]
        : []),
    ];
    return ss;
  }, [
    api,
    user?.Id,
    collections,
    t,
    createCollectionConfig,
    settings?.streamyStatsMovieRecommendations,
    settings.mergeNextUpAndContinueWatching,
  ]);

  const customSections = useMemo(() => {
    if (!api || !user?.Id || !settings?.home?.sections) return [];
    const ss: Section[] = [];
    settings.home.sections.forEach((section, index) => {
      const id = section.title || `section-${index}`;
      const pageSize = 10;
      ss.push({
        title: t(`${id}`),
        queryKey: ["home", "custom", String(index), section.title ?? null],
        queryFn: async ({ pageParam = 0 }) => {
          if (section.items) {
            const response = await getItemsApi(api).getItems({
              userId: user?.Id,
              startIndex: pageParam,
              limit: section.items?.limit || pageSize,
              recursive: true,
              includeItemTypes: section.items?.includeItemTypes,
              sortBy: section.items?.sortBy,
              sortOrder: section.items?.sortOrder,
              filters: section.items?.filters,
              parentId: section.items?.parentId,
            });
            return response.data.Items || [];
          }
          if (section.nextUp) {
            const response = await getTvShowsApi(api).getNextUp({
              userId: user?.Id,
              startIndex: pageParam,
              limit: section.nextUp?.limit || pageSize,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
              enableResumable: section.nextUp?.enableResumable,
              enableRewatching: section.nextUp?.enableRewatching,
            });
            return response.data.Items || [];
          }
          if (section.latest) {
            const allData =
              (
                await getUserLibraryApi(api).getLatestMedia({
                  userId: user?.Id,
                  includeItemTypes: section.latest?.includeItemTypes,
                  limit: section.latest?.limit || 10,
                  isPlayed: section.latest?.isPlayed,
                  groupItems: section.latest?.groupItems,
                })
              ).data || [];

            return allData.slice(pageParam, pageParam + pageSize);
          }
          if (section.custom) {
            const response = await api.get<BaseItemDtoQueryResult>(
              section.custom.endpoint,
              {
                params: {
                  ...(section.custom.query || {}),
                  userId: user?.Id,
                  startIndex: pageParam,
                  limit: pageSize,
                },
                headers: section.custom.headers || {},
              },
            );
            return response.data.Items || [];
          }
          return [];
        },
        type: "InfiniteScrollingCollectionList",
        orientation: section?.orientation || "vertical",
        pageSize,
      });
    });
    return ss;
  }, [api, user?.Id, settings?.home?.sections, t]);

  const sections = settings?.home?.sections ? customSections : defaultSections;

  // Determine if hero should be shown (separate setting from backdrop)
  // We need this early to calculate which sections will actually be rendered
  const showHero = useMemo(() => {
    return heroItems && heroItems.length > 0 && settings.showHeroCarousel;
  }, [heroItems, settings.showHeroCarousel]);

  // Get sections that will actually be rendered (accounting for hero slicing)
  // When hero is shown, skip the first sections since hero already displays that content
  // - If mergeNextUpAndContinueWatching: skip 1 section (combined Continue & Next Up)
  // - Otherwise: skip 2 sections (separate Continue Watching + Next Up)
  const renderedSections = useMemo(() => {
    if (!showHero) return sections;
    const sectionsToSkip = settings.mergeNextUpAndContinueWatching ? 1 : 2;
    return sections.slice(sectionsToSkip);
  }, [sections, showHero, settings.mergeNextUpAndContinueWatching]);

  if (!isConnected || serverConnected !== true) {
    let title = "";
    let subtitle = "";

    if (!isConnected) {
      title = t("home.no_internet");
      subtitle = t("home.no_internet_message");
    } else if (serverConnected === null) {
      title = t("home.checking_server_connection");
      subtitle = t("home.checking_server_connection_message");
    } else if (!serverConnected) {
      title = t("home.server_unreachable");
      subtitle = t("home.server_unreachable_message");
    }
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: HORIZONTAL_PADDING,
        }}
      >
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "bold",
            marginBottom: 8,
            color: "#FFFFFF",
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            textAlign: "center",
            opacity: 0.7,
            fontSize: typography.body,
            color: "#FFFFFF",
          }}
        >
          {subtitle}
        </Text>

        <View style={{ marginTop: 24 }}>
          <Button
            color='black'
            onPress={retryCheck}
            justify='center'
            className='px-4'
            iconRight={
              retryLoading ? null : (
                <Ionicons name='refresh' size={24} color='white' />
              )
            }
          >
            {retryLoading ? (
              <ActivityIndicator size='small' color='white' />
            ) : (
              t("home.retry")
            )}
          </Button>
        </View>
      </View>
    );
  }

  if (e1)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "bold",
            marginBottom: 8,
            color: "#FFFFFF",
          }}
        >
          {t("home.oops")}
        </Text>
        <Text
          style={{
            textAlign: "center",
            opacity: 0.7,
            fontSize: typography.body,
            color: "#FFFFFF",
          }}
        >
          {t("home.error_message")}
        </Text>
      </View>
    );

  if (l1)
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Loader />
      </View>
    );

  return (
    <View key={cacheVersion} style={{ flex: 1, backgroundColor: "#000000" }}>
      {/* Dynamic backdrop with crossfade - only shown when hero is disabled */}
      {!showHero && settings.showHomeBackdrop && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          {/* Layer 0 */}
          <Animated.View
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              opacity: layer0Opacity,
            }}
          >
            {layer0Url && (
              <Image
                source={{ uri: layer0Url }}
                style={{ width: "100%", height: "100%" }}
                contentFit='cover'
              />
            )}
          </Animated.View>
          {/* Layer 1 */}
          <Animated.View
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              opacity: layer1Opacity,
            }}
          >
            {layer1Url && (
              <Image
                source={{ uri: layer1Url }}
                style={{ width: "100%", height: "100%" }}
                contentFit='cover'
              />
            )}
          </Animated.View>
          {/* Gradient overlays for readability */}
          <LinearGradient
            colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.95)"]}
            locations={[0, 0.4, 1]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "100%",
            }}
          />
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: showHero ? 0 : insets.top + TOP_PADDING,
          paddingBottom: insets.bottom + 60,
        }}
      >
        {/* Hero Carousel - Apple TV+ style featured content */}
        {showHero && heroItems && (
          <TVHeroCarousel
            items={heroItems}
            onItemFocus={handleItemFocus}
            onItemLongPress={showItemActions}
          />
        )}

        <View
          style={{
            gap: SECTION_GAP,
            paddingTop: showHero ? SECTION_GAP : 0,
          }}
        >
          {/* Skip first section (Continue Watching) when hero is shown since hero displays that content */}
          {renderedSections.map((section, index) => {
            // Render Streamystats sections after Recently Added sections
            // For default sections: place after Recently Added, before Suggested Movies (if present)
            // For custom sections: place at the very end
            const hasSuggestedMovies =
              !settings?.streamyStatsMovieRecommendations &&
              !settings?.home?.sections;
            const displayedSectionsLength = renderedSections.length;
            const streamystatsIndex =
              displayedSectionsLength - 1 - (hasSuggestedMovies ? 1 : 0);
            const hasStreamystatsContent =
              settings.streamyStatsMovieRecommendations ||
              settings.streamyStatsSeriesRecommendations ||
              settings.streamyStatsPromotedWatchlists;
            const streamystatsSections =
              index === streamystatsIndex && hasStreamystatsContent ? (
                <View key='streamystats-sections' style={{ gap: SECTION_GAP }}>
                  {settings.streamyStatsMovieRecommendations && (
                    <StreamystatsRecommendations
                      title={t(
                        "home.settings.plugins.streamystats.recommended_movies",
                      )}
                      type='Movie'
                      onItemFocus={handleItemFocus}
                    />
                  )}
                  {settings.streamyStatsSeriesRecommendations && (
                    <StreamystatsRecommendations
                      title={t(
                        "home.settings.plugins.streamystats.recommended_series",
                      )}
                      type='Series'
                      onItemFocus={handleItemFocus}
                    />
                  )}
                  {settings.streamyStatsPromotedWatchlists && (
                    <StreamystatsPromotedWatchlists
                      onItemFocus={handleItemFocus}
                    />
                  )}
                </View>
              ) : null;

            if (section.type === "InfiniteScrollingCollectionList") {
              // First section only gets preferred focus if hero is not shown
              const isFirstSection = index === 0 && !showHero;
              return (
                <View key={index} style={{ gap: SECTION_GAP }}>
                  <InfiniteScrollingCollectionList
                    title={section.title}
                    queryKey={section.queryKey}
                    queryFn={section.queryFn}
                    orientation={section.orientation}
                    displayShowName={true}
                    hideIfEmpty
                    pageSize={section.pageSize}
                    isFirstSection={isFirstSection}
                    onItemFocus={handleItemFocus}
                    parentId={section.parentId}
                  />
                  {streamystatsSections}
                </View>
              );
            }
            return null;
          })}
        </View>
      </ScrollView>
    </View>
  );
};
