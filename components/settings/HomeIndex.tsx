import { Feather, Ionicons } from "@expo/vector-icons";
import type { Api } from "@jellyfin/sdk";
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
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedRef,
  useScrollViewOffset,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { ScrollingCollectionList } from "@/components/home/ScrollingCollectionList";
import { Loader } from "@/components/Loader";
import { MediaListSection } from "@/components/medialists/MediaListSection";
import { Colors } from "@/constants/Colors";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";
import { AppleTVCarousel } from "../AppleTVCarousel";

type ScrollingCollectionListSection = {
  type: "ScrollingCollectionList";
  title?: string;
  queryKey: (string | undefined | null)[];
  queryFn: QueryFunction<BaseItemDto[]>;
  orientation?: "horizontal" | "vertical";
};

type MediaListSectionType = {
  type: "MediaListSection";
  queryKey: (string | undefined)[];
  queryFn: QueryFunction<BaseItemDto>;
};

type Section = ScrollingCollectionListSection | MediaListSectionType;

export const HomeIndex = () => {
  const router = useRouter();

  const { t } = useTranslation();

  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const { settings, refreshStreamyfinPluginSettings } = useSettings();
  const showLargeHomeCarousel = settings.showLargeHomeCarousel ?? true;
  const headerOverlayOffset = Platform.isTV
    ? 0
    : showLargeHomeCarousel
      ? 60
      : 0;

  const navigation = useNavigation();

  const animatedScrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollViewOffset(animatedScrollRef);

  const { getDownloadedItems, cleanCacheDirectory } = useDownload();
  const prevIsConnected = useRef<boolean | null>(false);
  const {
    isConnected,
    serverConnected,
    loading: retryLoading,
    retryCheck,
  } = useNetworkStatus();
  const invalidateCache = useInvalidatePlaybackProgressCache();
  useEffect(() => {
    // Only invalidate cache when transitioning from offline to online
    if (isConnected && !prevIsConnected.current) {
      invalidateCache();
    }
    // Update the ref to the current state for the next render
    prevIsConnected.current = isConnected;
  }, [isConnected, invalidateCache]);

  useEffect(() => {
    if (Platform.isTV) {
      navigation.setOptions({
        headerLeft: () => null,
      });
      return;
    }
    const hasDownloads = getDownloadedItems().length > 0;
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            router.push("/(auth)/downloads");
          }}
          className='ml-1.5'
        >
          <Feather
            name='download'
            color={hasDownloads ? Colors.primary : "white"}
            size={24}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, router]);

  useEffect(() => {
    cleanCacheDirectory().catch((_e) =>
      console.error("Something went wrong cleaning cache directory"),
    );
  }, []);

  const segments = useSegments();
  useEffect(() => {
    const unsubscribe = eventBus.on("scrollToTop", () => {
      if ((segments as string[])[2] === "(home)")
        animatedScrollRef.current?.scrollTo({
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
    ): ScrollingCollectionListSection => ({
      title,
      queryKey,
      queryFn: async () => {
        if (!api) return [];
        return (
          (
            await getUserLibraryApi(api).getLatestMedia({
              userId: user?.Id,
              limit: 20,
              fields: ["PrimaryImageAspectRatio", "Path", "Genres"],
              imageTypeLimit: 1,
              enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
              includeItemTypes,
              parentId,
            })
          ).data || []
        );
      },
      type: "ScrollingCollectionList",
    }),
    [api, user?.Id],
  );

  // Always call useMemo() at the top-level, using computed dependencies for both "default"/custom sections
  const defaultSections = useMemo(() => {
    if (!api || !user?.Id) return [];

    const latestMediaViews = collections.map((c) => {
      const includeItemTypes: BaseItemKind[] =
        c.CollectionType === "tvshows" || c.CollectionType === "movies"
          ? []
          : ["Movie"];
      const title = t("home.recently_added_in", { libraryName: c.Name });
      const queryKey = [
        "home",
        `recentlyAddedIn${c.CollectionType}`,
        user?.Id!,
        c.Id!,
      ];
      return createCollectionConfig(
        title || "",
        queryKey,
        includeItemTypes,
        c.Id,
      );
    });

    const ss: Section[] = [
      {
        title: t("home.continue_watching"),
        queryKey: ["home", "resumeItems"],
        queryFn: async () =>
          (
            await getItemsApi(api).getResumeItems({
              userId: user.Id,
              enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
              includeItemTypes: ["Movie", "Series", "Episode"],
              fields: ["Genres"],
            })
          ).data.Items || [],
        type: "ScrollingCollectionList",
        orientation: "horizontal",
      },
      {
        title: t("home.next_up"),
        queryKey: ["home", "nextUp-all"],
        queryFn: async () =>
          (
            await getTvShowsApi(api).getNextUp({
              userId: user?.Id,
              fields: ["MediaSourceCount", "Genres"],
              limit: 20,
              enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
              enableResumable: false,
            })
          ).data.Items || [],
        type: "ScrollingCollectionList",
        orientation: "horizontal",
      },
      ...latestMediaViews,
      // ...(mediaListCollections?.map(
      //   (ml) =>
      //     ({
      //       title: ml.Name,
      //       queryKey: ["home", "mediaList", ml.Id!],
      //       queryFn: async () => ml,
      //       type: "MediaListSection",
      //       orientation: "vertical",
      //     } as Section)
      // ) || []),
      {
        title: t("home.suggested_movies"),
        queryKey: ["home", "suggestedMovies", user?.Id],
        queryFn: async () =>
          (
            await getSuggestionsApi(api).getSuggestions({
              userId: user?.Id,
              limit: 10,
              mediaType: ["Video"],
              type: ["Movie"],
            })
          ).data.Items || [],
        type: "ScrollingCollectionList",
        orientation: "vertical",
      },
      {
        title: t("home.suggested_episodes"),
        queryKey: ["home", "suggestedEpisodes", user?.Id],
        queryFn: async () => {
          try {
            const suggestions = await getSuggestions(api, user.Id);
            const nextUpPromises = suggestions.map((series) =>
              getNextUp(api, user.Id, series.Id),
            );
            const nextUpResults = await Promise.all(nextUpPromises);

            return nextUpResults.filter((item) => item !== null) || [];
          } catch (error) {
            console.error("Error fetching data:", error);
            return [];
          }
        },
        type: "ScrollingCollectionList",
        orientation: "horizontal",
      },
    ];
    return ss;
  }, [api, user?.Id, collections, t, createCollectionConfig]);

  const customSections = useMemo(() => {
    if (!api || !user?.Id || !settings?.home?.sections) return [];
    const ss: Section[] = [];
    settings.home.sections.forEach((section, index) => {
      const id = section.title || `section-${index}`;
      ss.push({
        title: t(`${id}`),
        queryKey: ["home", "custom", String(index), section.title ?? null],
        queryFn: async () => {
          if (section.items) {
            const response = await getItemsApi(api).getItems({
              userId: user?.Id,
              limit: section.items?.limit || 25,
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
              limit: section.nextUp?.limit || 25,
              enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
              enableResumable: section.nextUp?.enableResumable,
              enableRewatching: section.nextUp?.enableRewatching,
            });
            return response.data.Items || [];
          }
          if (section.latest) {
            const response = await getUserLibraryApi(api).getLatestMedia({
              userId: user?.Id,
              includeItemTypes: section.latest?.includeItemTypes,
              limit: section.latest?.limit || 25,
              isPlayed: section.latest?.isPlayed,
              groupItems: section.latest?.groupItems,
            });
            return response.data || [];
          }
          if (section.custom) {
            const response = await api.get<BaseItemDtoQueryResult>(
              section.custom.endpoint,
              {
                params: { ...(section.custom.query || {}), userId: user?.Id },
                headers: section.custom.headers || {},
              },
            );
            return response.data.Items || [];
          }
          return [];
        },
        type: "ScrollingCollectionList",
        orientation: section?.orientation || "vertical",
      });
    });
    return ss;
  }, [api, user?.Id, settings?.home?.sections]);

  const sections = settings?.home?.sections ? customSections : defaultSections;

  if (!isConnected || serverConnected !== true) {
    let title = "";
    let subtitle = "";

    if (!isConnected) {
      // No network connection
      title = t("home.no_internet");
      subtitle = t("home.no_internet_message");
    } else if (serverConnected === null) {
      // Network is up, but server is being checked
      title = t("home.checking_server_connection");
      subtitle = t("home.checking_server_connection_message");
    } else if (!serverConnected) {
      // Network is up, but server is unreachable
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
    <Animated.ScrollView
      scrollToOverflowEnabled={true}
      ref={animatedScrollRef}
      nestedScrollEnabled
      contentInsetAdjustmentBehavior='never'
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refetch}
          tintColor='white' // For iOS
          colors={["white"]} // For Android
          progressViewOffset={showLargeHomeCarousel ? 200 : 0} // This offsets the refresh indicator to appear over the carousel
        />
      }
      style={{ marginTop: -headerOverlayOffset }}
      contentContainerStyle={{ paddingTop: headerOverlayOffset }}
    >
      {showLargeHomeCarousel && (
        <AppleTVCarousel initialIndex={0} scrollOffset={scrollOffset} />
      )}
      <View
        style={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: 16,
          paddingTop: Platform.isTV
            ? 0
            : showLargeHomeCarousel
              ? 0
              : insets.top + 60,
        }}
      >
        <View className='flex flex-col space-y-4'>
          {sections.map((section, index) => {
            if (section.type === "ScrollingCollectionList") {
              return (
                <ScrollingCollectionList
                  key={index}
                  title={section.title}
                  queryKey={section.queryKey}
                  queryFn={section.queryFn}
                  orientation={section.orientation}
                  hideIfEmpty
                />
              );
            }
            if (section.type === "MediaListSection") {
              return (
                <MediaListSection
                  key={index}
                  queryKey={section.queryKey}
                  queryFn={section.queryFn}
                />
              );
            }
            return null;
          })}
        </View>
      </View>
      <View className='h-24' />
    </Animated.ScrollView>
  );
};

// Function to get suggestions
async function getSuggestions(api: Api, userId: string | undefined) {
  if (!userId) return [];
  const response = await getSuggestionsApi(api).getSuggestions({
    userId,
    limit: 10,
    mediaType: ["Unknown"],
    type: ["Series"],
  });
  return response.data.Items ?? [];
}

// Function to get the next up TV show for a series
async function getNextUp(
  api: Api,
  userId: string | undefined,
  seriesId: string | undefined,
) {
  if (!userId || !seriesId) return null;
  const response = await getTvShowsApi(api).getNextUp({
    userId,
    seriesId,
    limit: 1,
  });
  return response.data.Items?.[0] ?? null;
}
