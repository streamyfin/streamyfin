import { Feather, Ionicons } from "@expo/vector-icons";
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
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { InfiniteScrollingCollectionList } from "@/components/home/InfiniteScrollingCollectionList";
import { Loader } from "@/components/Loader";
import { MediaListSection } from "@/components/medialists/MediaListSection";
import { Colors } from "@/constants/Colors";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useDownload } from "@/providers/DownloadProvider";
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
  const {
    isConnected,
    serverConnected,
    loading: retryLoading,
    retryCheck,
  } = useNetworkStatus();
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
    const allow = ["movies", "tvshows"];
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

  const sections = settings?.home?.sections ? customSections : defaultSections;

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
      <View className='flex flex-col items-center justify-center h-full -mt-6 px-8'>
        <Text className='text-3xl font-bold mb-2'>{title}</Text>
        <Text className='text-center opacity-70'>{subtitle}</Text>

        <View className='mt-4'>
          {!Platform.isTV && (
            <Button
              color='purple'
              onPress={() => router.push("/(auth)/downloads")}
              justify='center'
              iconRight={
                <Ionicons name='arrow-forward' size={20} color='white' />
              }
            >
              {t("home.go_to_downloads")}
            </Button>
          )}

          <Button
            color='black'
            onPress={retryCheck}
            justify='center'
            className='mt-2'
            iconRight={
              retryLoading ? null : (
                <Ionicons name='refresh' size={20} color='white' />
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
      <View className='flex flex-col items-center justify-center h-full -mt-6'>
        <Text className='text-3xl font-bold mb-2'>{t("home.oops")}</Text>
        <Text className='text-center opacity-70'>
          {t("home.error_message")}
        </Text>
      </View>
    );

  if (l1)
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
