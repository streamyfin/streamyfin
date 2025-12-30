import { Feather } from "@expo/vector-icons";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getItemsApi,
  getSuggestionsApi,
  getTvShowsApi,
  getUserLibraryApi,
  getUserViewsApi,
} from "@jellyfin/sdk/lib/utils/api";
import { type QueryFunction, useQuery } from "@tanstack/react-query";
import { useNavigation, useRouter, useSegments } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { InfiniteScrollingCollectionList } from "@/components/home/InfiniteScrollingCollectionList";
import { Loader } from "@/components/Loader";
import { MediaListSection } from "@/components/medialists/MediaListSection";
import { Colors } from "@/constants/Colors";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useDownload } from "@/providers/DownloadProvider";
import { useOfflineHomeSections } from "@/providers/HomeData/useHomeBackend";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";

type InfiniteScrollingCollectionListSection = {
  type: "InfiniteScrollingCollectionList";
  title?: string;
  queryKey: (string | undefined | null)[];
  queryFn: QueryFunction<BaseItemDto[], any, number>;
  orientation?: "horizontal" | "vertical";
  pageSize?: number;
};

type MediaListSectionType = {
  type: "MediaListSection";
  queryKey: (string | undefined)[];
  queryFn: QueryFunction<BaseItemDto>;
};

type Section = InfiniteScrollingCollectionListSection | MediaListSectionType;

export const Home = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const { settings, refreshStreamyfinPluginSettings } = useSettings();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const { downloadedItems, cleanCacheDirectory } = useDownload();
  const prevIsConnected = useRef<boolean | null>(false);
  const { isConnected } = useNetworkStatus();
  const invalidateCache = useInvalidatePlaybackProgressCache();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    if (isConnected && !prevIsConnected.current) {
      invalidateCache();
    }
    prevIsConnected.current = isConnected;
  }, [isConnected, invalidateCache]);

  const hasDownloads = useMemo(() => {
    if (Platform.isTV) return false;
    return downloadedItems.length > 0;
  }, [downloadedItems]);

  useEffect(() => {
    if (Platform.isTV) {
      navigation.setOptions({
        headerLeft: () => null,
      });
      return;
    }
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            router.push("/(auth)/downloads");
          }}
          className='ml-1.5'
          style={{ marginRight: Platform.OS === "android" ? 16 : 0 }}
        >
          <Feather
            name='download'
            color={hasDownloads ? Colors.primary : "white"}
            size={24}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, router, hasDownloads]);

  useEffect(() => {
    cleanCacheDirectory().catch((_e) =>
      console.error("Something went wrong cleaning cache directory"),
    );
  }, []);

  const segments = useSegments();
  useEffect(() => {
    const unsubscribe = eventBus.on("scrollToTop", () => {
      if ((segments as string[])[2] === "(home)")
        scrollRef.current?.scrollTo({
          y: Platform.isTV ? -152 : -100,
          animated: true,
        });
    });

    return () => {
      unsubscribe();
    };
  }, [segments]);

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
  });

  const userViews = useMemo(
    () => data?.filter((l) => !settings?.hiddenLibraries?.includes(l.Id!)),
    [data, settings?.hiddenLibraries],
  );

  const collections = useMemo(() => {
    const allow = ["movies", "tvshows", "music"];
    return (
      userViews?.filter(
        (c) => c.CollectionType && allow.includes(c.CollectionType),
      ) || []
    );
  }, [userViews]);

  const refetch = async () => {
    setLoading(true);
    await refreshStreamyfinPluginSettings();
    await invalidateCache();
    setLoading(false);
  };

  const createCollectionConfig = useCallback(
    (
      title: string,
      queryKey: string[],
      includeItemTypes: BaseItemKind[],
      parentId: string | undefined,
      pageSize: number = 10,
    ): InfiniteScrollingCollectionListSection => ({
      title,
      queryKey,
      queryFn: async ({ pageParam = 0 }) => {
        if (!api) return [];
        // getLatestMedia doesn't support startIndex, so we fetch all and slice client-side
        const allData =
          (
            await getUserLibraryApi(api).getLatestMedia({
              userId: user?.Id,
              limit: 100, // Fetch a larger set for pagination
              fields: ["PrimaryImageAspectRatio", "Path", "Genres"],
              imageTypeLimit: 1,
              enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
              includeItemTypes,
              parentId,
              groupItems: false, // Don't group items (important for music albums)
            })
          ).data || [];

        // Simulate pagination by slicing
        return allData.slice(pageParam, pageParam + pageSize);
      },
      type: "InfiniteScrollingCollectionList",
      pageSize,
    }),
    [api, user?.Id],
  );

  const defaultSections = useMemo(() => {
    if (!api || !user?.Id) return [];

    const latestMediaViews = collections.map((c) => {
      let includeItemTypes: BaseItemKind[] = ["Movie"];
      let pageSize = 10;
      if (c.CollectionType === "tvshows" || c.CollectionType === "movies") {
        includeItemTypes = [];
      } else if (c.CollectionType === "music") {
        includeItemTypes = ["MusicAlbum"];
        pageSize = 30; // Show more albums for music
      }
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
        pageSize,
      );
    });

    const ss: Section[] = [
      {
        title: t("home.continue_watching"),
        queryKey: ["home", "resumeItems"],
        queryFn: async ({ pageParam = 0 }) =>
          (
            await getItemsApi(api).getResumeItems({
              userId: user.Id,
              enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
              includeItemTypes: ["Movie", "Series", "Episode"],
              fields: ["Genres"],
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
              fields: ["MediaSourceCount", "Genres"],
              startIndex: pageParam,
              limit: 10,
              enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
              enableResumable: false,
            })
          ).data.Items || [],
        type: "InfiniteScrollingCollectionList",
        orientation: "horizontal",
        pageSize: 10,
      },
      {
        title: t("home.continue_listening"),
        queryKey: ["home", "resumeMusic"],
        queryFn: async ({ pageParam = 0 }) =>
          (
            await getItemsApi(api).getResumeItems({
              userId: user.Id,
              includeItemTypes: ["MusicAlbum", "Audio"],
              enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
              fields: ["Genres"],
              startIndex: pageParam,
              limit: 10,
            })
          ).data.Items || [],
        type: "InfiniteScrollingCollectionList",
        orientation: "horizontal",
        pageSize: 10,
      },
      {
        title: t("home.recently_listened"),
        queryKey: ["home", "recentlyListened"],
        queryFn: async ({ pageParam = 0 }) => {
          // Get recently played audio tracks
          const response = await getItemsApi(api).getItems({
            userId: user.Id,
            includeItemTypes: ["Audio"],
            sortBy: ["DatePlayed"],
            sortOrder: ["Descending"],
            filters: ["IsPlayed"],
            fields: ["Genres", "ParentId"],
            limit: 100, // Get more tracks to ensure we get enough unique albums
            recursive: true,
          });

          const tracks = response.data.Items || [];

          // Get unique parent albums
          const seenAlbumIds = new Set<string>();
          const uniqueAlbums: BaseItemDto[] = [];

          for (const track of tracks) {
            if (track.AlbumId && !seenAlbumIds.has(track.AlbumId)) {
              seenAlbumIds.add(track.AlbumId);
              // Fetch the album details
              const albumResponse = await getItemsApi(api).getItems({
                userId: user.Id,
                ids: [track.AlbumId],
                fields: ["Genres"],
                enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
              });
              if (albumResponse.data.Items?.[0]) {
                uniqueAlbums.push(albumResponse.data.Items[0]);
              }
            }
            if (uniqueAlbums.length >= pageParam + 10) break;
          }

          // Return paginated slice
          return uniqueAlbums.slice(pageParam, pageParam + 10);
        },
        type: "InfiniteScrollingCollectionList",
        orientation: "horizontal",
        pageSize: 10,
      },
      ...latestMediaViews,
      {
        title: t("home.suggested_movies"),
        queryKey: ["home", "suggestedMovies", user?.Id],
        queryFn: async ({ pageParam = 0 }) =>
          (
            await getSuggestionsApi(api).getSuggestions({
              userId: user?.Id,
              startIndex: pageParam,
              limit: 10,
              mediaType: ["Video"],
              type: ["Movie"],
            })
          ).data.Items || [],
        type: "InfiniteScrollingCollectionList",
        orientation: "vertical",
        pageSize: 10,
      },
    ];
    return ss;
  }, [api, user?.Id, collections, t, createCollectionConfig]);

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
              fields: ["MediaSourceCount", "Genres"],
              startIndex: pageParam,
              limit: section.nextUp?.limit || pageSize,
              enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
              enableResumable: section.nextUp?.enableResumable,
              enableRewatching: section.nextUp?.enableRewatching,
            });
            return response.data.Items || [];
          }
          if (section.latest) {
            // getLatestMedia doesn't support startIndex, so we fetch all and slice client-side
            const allData =
              (
                await getUserLibraryApi(api).getLatestMedia({
                  userId: user?.Id,
                  includeItemTypes: section.latest?.includeItemTypes,
                  limit: section.latest?.limit || 100, // Fetch larger set
                  isPlayed: section.latest?.isPlayed,
                  groupItems: section.latest?.groupItems,
                })
              ).data || [];

            // Simulate pagination by slicing
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

  // Get offline sections when in offline mode
  const offlineSections = useOfflineHomeSections();

  // Use offline sections if available, otherwise use live sections
  const sections =
    offlineSections ??
    (settings?.home?.sections ? customSections : defaultSections);

  // Skip error state when we have offline sections to display
  if (e1 && !offlineSections)
    return (
      <View className='flex flex-col items-center justify-center h-full -mt-6'>
        <Text className='text-3xl font-bold mb-2'>{t("home.oops")}</Text>
        <Text className='text-center opacity-70'>
          {t("home.error_message")}
        </Text>
      </View>
    );

  // Skip loading state when we have offline sections to display
  if (l1 && !offlineSections)
    return (
      <View className='justify-center items-center h-full'>
        <Loader />
      </View>
    );

  return (
    <ScrollView
      ref={scrollRef}
      nestedScrollEnabled
      contentInsetAdjustmentBehavior='automatic'
      onScroll={(event) => {
        setScrollY(event.nativeEvent.contentOffset.y - 500);
      }}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refetch}
          tintColor='white'
          colors={["white"]}
        />
      }
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 16,
      }}
    >
      <View
        className='flex flex-col space-y-4'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        {sections.map((section, index) => {
          if (section.type === "InfiniteScrollingCollectionList") {
            return (
              <InfiniteScrollingCollectionList
                key={index}
                title={section.title}
                queryKey={section.queryKey}
                queryFn={section.queryFn}
                orientation={section.orientation}
                hideIfEmpty
                pageSize={section.pageSize}
              />
            );
          }
          if (section.type === "MediaListSection") {
            return (
              <MediaListSection
                key={index}
                queryKey={section.queryKey}
                queryFn={section.queryFn}
                scrollY={scrollY}
                enableLazyLoading={true}
              />
            );
          }
          return null;
        })}
      </View>
    </ScrollView>
  );
};
