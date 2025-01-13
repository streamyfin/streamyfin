import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { LargeMovieCarousel } from "@/components/home/LargeMovieCarousel";
import { ScrollingCollectionList } from "@/components/home/ScrollingCollectionList";
import { Loader } from "@/components/Loader";
import { MediaListSection } from "@/components/medialists/MediaListSection";
import { Colors } from "@/constants/Colors";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { HomeSectionStyle, useSettings } from "@/utils/atoms/settings";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Api } from "@jellyfin/sdk";
import {
  BaseItemDto,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getItemsApi,
  getSuggestionsApi,
  getTvShowsApi,
  getUserLibraryApi,
  getUserViewsApi,
} from "@jellyfin/sdk/lib/utils/api";
import NetInfo from "@react-native-community/netinfo";
import { QueryFunction, useQuery } from "@tanstack/react-query";
import { useNavigation, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ScrollingCollectionListSection = {
  type: "ScrollingCollectionList";
  title?: string;
  queryKey: (string | undefined | null)[];
  queryFn: QueryFunction<BaseItemDto[]>;
  orientation?: "horizontal" | "vertical";
};

type MediaListSection = {
  type: "MediaListSection";
  queryKey: (string | undefined)[];
  queryFn: QueryFunction<BaseItemDto>;
};

type Section = ScrollingCollectionListSection | MediaListSection;

export default function index() {
  const router = useRouter();

  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const [loading, setLoading] = useState(false);
  const [settings, _] = useSettings();

  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [loadingRetry, setLoadingRetry] = useState(false);

  const { downloadedFiles, cleanCacheDirectory } = useDownload();
  const navigation = useNavigation();

  const insets = useSafeAreaInsets();

  useEffect(() => {
    const hasDownloads = downloadedFiles && downloadedFiles.length > 0;
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            router.push("/(auth)/downloads");
          }}
          className="p-2"
        >
          <Feather
            name="download"
            color={hasDownloads ? Colors.primary : "white"}
            size={22}
          />
        </TouchableOpacity>
      ),
    });
  }, [downloadedFiles, navigation, router]);

  const checkConnection = useCallback(async () => {
    setLoadingRetry(true);
    const state = await NetInfo.fetch();
    setIsConnected(state.isConnected);
    setLoadingRetry(false);
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected == false || state.isInternetReachable === false)
        setIsConnected(false);
      else setIsConnected(true);
    });

    NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected);
    });

    cleanCacheDirectory().catch((e) =>
      console.error("Something went wrong cleaning cache directory")
    );
    return () => {
      unsubscribe();
    };
  }, []);

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
    [data, settings?.hiddenLibraries]
  );

  const {
    data: mediaListCollections,
    isError: e2,
    isLoading: l2,
  } = useQuery({
    queryKey: ["home", "sf_promoted", user?.Id, settings?.usePopularPlugin],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        tags: ["sf_promoted"],
        recursive: true,
        fields: ["Tags"],
        includeItemTypes: ["BoxSet"],
      });

      return response.data.Items || [];
    },
    enabled: !!api && !!user?.Id && settings?.usePopularPlugin === true,
    staleTime: 60 * 1000,
  });

  const collections = useMemo(() => {
    const allow = ["movies", "tvshows"];
    return (
      userViews?.filter(
        (c) => c.CollectionType && allow.includes(c.CollectionType)
      ) || []
    );
  }, [userViews]);

  const invalidateCache = useInvalidatePlaybackProgressCache();

  const refetch = useCallback(async () => {
    setLoading(true);
    await invalidateCache();
    setLoading(false);
  }, []);

  const createCollectionConfig = useCallback(
    (
      title: string,
      queryKey: string[],
      includeItemTypes: BaseItemKind[],
      parentId: string | undefined
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
              fields: ["PrimaryImageAspectRatio", "Path"],
              imageTypeLimit: 1,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
              includeItemTypes,
              parentId,
            })
          ).data || []
        );
      },
      type: "ScrollingCollectionList",
    }),
    [api, user?.Id]
  );

  let sections: Section[] = [];
  if (settings?.home === null) {
    sections = useMemo(() => {
      if (!api || !user?.Id) return [];

      const latestMediaViews = collections.map((c) => {
        const includeItemTypes: BaseItemKind[] =
          c.CollectionType === "tvshows" ? ["Series"] : ["Movie"];
        const title = "Recently Added in " + c.Name;
        const queryKey = [
          "home",
          "recentlyAddedIn" + c.CollectionType,
          user?.Id!,
          c.Id!,
        ];
        return createCollectionConfig(
          title || "",
          queryKey,
          includeItemTypes,
          c.Id
        );
      });

      const ss: Section[] = [
        {
          title: "Continue Watching",
          queryKey: ["home", "resumeItems"],
          queryFn: async () =>
            (
              await getItemsApi(api).getResumeItems({
                userId: user.Id,
                enableImageTypes: ["Primary", "Backdrop", "Thumb"],
                includeItemTypes: ["Movie", "Series", "Episode"],
              })
            ).data.Items || [],
          type: "ScrollingCollectionList",
          orientation: "horizontal",
        },
        {
          title: "Next Up",
          queryKey: ["home", "nextUp-all"],
          queryFn: async () =>
            (
              await getTvShowsApi(api).getNextUp({
                userId: user?.Id,
                fields: ["MediaSourceCount"],
                limit: 20,
                enableImageTypes: ["Primary", "Backdrop", "Thumb"],
                enableResumable: false,
              })
            ).data.Items || [],
          type: "ScrollingCollectionList",
          orientation: "horizontal",
        },
        ...latestMediaViews,
        ...(mediaListCollections?.map(
          (ml) =>
            ({
              title: ml.Name,
              queryKey: ["home", "mediaList", ml.Id!],
              queryFn: async () => ml,
              type: "MediaListSection",
              orientation: "vertical",
            } as Section)
        ) || []),
        {
          title: "Suggested Movies",
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
          title: "Suggested Episodes",
          queryKey: ["home", "suggestedEpisodes", user?.Id],
          queryFn: async () => {
            try {
              const suggestions = await getSuggestions(api, user.Id);
              const nextUpPromises = suggestions.map((series) =>
                getNextUp(api, user.Id, series.Id)
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
    }, [api, user?.Id, collections, mediaListCollections]);
  } else {
    settings.home?.sections.forEach((section, key) => {
      sections.push({
        title: key,
        queryKey: ["home", key, user?.Id],
        queryFn: async () =>
          (
            await getItemsApi(api).getItems({
              userId: user?.Id,
              limit: section.items?.limit || 20,
              recursive: true,
              includeItemTypes: section.items?.includeItemTypes,
              sortBy: section.items?.sortBy,
              sortOrder: section.items?.sortOrder,
              filters: section.items?.filters,
            })
          ).data.Items || [],
        type: "ScrollingCollectionList",
        orientation: section?.orientation || "vertical",
      });
    });
  }

  if (isConnected === false) {
    return (
      <View className="flex flex-col items-center justify-center h-full -mt-6 px-8">
        <Text className="text-3xl font-bold mb-2">No Internet</Text>
        <Text className="text-center opacity-70">
          No worries, you can still watch{"\n"}downloaded content.
        </Text>
        <View className="mt-4">
          <Button
            color="purple"
            onPress={() => router.push("/(auth)/downloads")}
            justify="center"
            iconRight={
              <Ionicons name="arrow-forward" size={20} color="white" />
            }
          >
            Go to downloads
          </Button>
          <Button
            color="black"
            onPress={() => {
              checkConnection();
            }}
            justify="center"
            className="mt-2"
            iconRight={
              loadingRetry ? null : (
                <Ionicons name="refresh" size={20} color="white" />
              )
            }
          >
            {loadingRetry ? (
              <ActivityIndicator size={"small"} color={"white"} />
            ) : (
              "Retry"
            )}
          </Button>
        </View>
      </View>
    );
  }

  if (e1 || e2)
    return (
      <View className="flex flex-col items-center justify-center h-full -mt-6">
        <Text className="text-3xl font-bold mb-2">Oops!</Text>
        <Text className="text-center opacity-70">
          Something went wrong.{"\n"}Please log out and in again.
        </Text>
      </View>
    );

  if (l1 || l2)
    return (
      <View className="justify-center items-center h-full">
        <Loader />
      </View>
    );

  return (
    <ScrollView
      nestedScrollEnabled
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refetch} />
      }
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 16,
      }}
    >
      <View className="flex flex-col space-y-4">
        <LargeMovieCarousel />

        {sections.map((section, index) => {
          if (section.type === "ScrollingCollectionList") {
            return (
              <ScrollingCollectionList
                key={index}
                title={section.title}
                queryKey={section.queryKey}
                queryFn={section.queryFn}
                orientation={section.orientation}
              />
            );
          } else if (section.type === "MediaListSection") {
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
    </ScrollView>
  );
}

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
  seriesId: string | undefined
) {
  if (!userId || !seriesId) return null;
  const response = await getTvShowsApi(api).getNextUp({
    userId,
    seriesId,
    limit: 1,
  });
  return response.data.Items?.[0] ?? null;
}
