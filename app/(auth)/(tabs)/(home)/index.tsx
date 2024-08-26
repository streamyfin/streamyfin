import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { LargeMovieCarousel } from "@/components/home/LargeMovieCarousel";
import { ScrollingCollectionList } from "@/components/home/ScrollingCollectionList";
import { Loader } from "@/components/Loader";
import { MediaListSection } from "@/components/medialists/MediaListSection";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { Ionicons } from "@expo/vector-icons";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  getItemsApi,
  getSuggestionsApi,
  getTvShowsApi,
  getUserLibraryApi,
  getUserViewsApi,
} from "@jellyfin/sdk/lib/utils/api";
import NetInfo from "@react-native-community/netinfo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

type BaseSection = {
  title: string;
  queryKey: (string | undefined)[];
};

type ScrollingCollectionListSection = BaseSection & {
  type: "ScrollingCollectionList";
  queryFn: () => Promise<BaseItemDto[]>;
  orientation?: "horizontal" | "vertical";
};

type MediaListSection = BaseSection & {
  type: "MediaListSection";
  queryFn: () => Promise<BaseItemDto>;
};

type Section = ScrollingCollectionListSection | MediaListSection;

export default function index() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const [loading, setLoading] = useState(false);
  const [settings, _] = useSettings();

  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected == false || state.isInternetReachable === false)
        setIsConnected(false);
      else setIsConnected(true);
    });

    NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const {
    data: userViews,
    isError: e1,
    isLoading: l1,
  } = useQuery({
    queryKey: ["userViews", user?.Id],
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

  const {
    data: mediaListCollections,
    isError: e2,
    isLoading: l2,
  } = useQuery({
    queryKey: ["sf_promoted", user?.Id, settings?.usePopularPlugin],
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

  const movieCollectionId = useMemo(() => {
    return userViews?.find((c) => c.CollectionType === "movies")?.Id;
  }, [userViews]);

  const tvShowCollectionId = useMemo(() => {
    return userViews?.find((c) => c.CollectionType === "tvshows")?.Id;
  }, [userViews]);

  const refetch = useCallback(async () => {
    setLoading(true);
    await queryClient.refetchQueries({ queryKey: ["userViews"] });
    await queryClient.refetchQueries({ queryKey: ["resumeItems"] });
    await queryClient.refetchQueries({ queryKey: ["nextUp-all"] });
    await queryClient.refetchQueries({ queryKey: ["recentlyAddedInMovies"] });
    await queryClient.refetchQueries({ queryKey: ["recentlyAddedInTVShows"] });
    await queryClient.refetchQueries({ queryKey: ["suggestions"] });
    await queryClient.refetchQueries({
      queryKey: ["sf_promoted"],
    });
    await queryClient.refetchQueries({
      queryKey: ["sf_carousel"],
    });
    setLoading(false);
  }, [queryClient, user?.Id]);

  const sections = useMemo(() => {
    if (!api || !user?.Id) return [];

    const ss: Section[] = [
      {
        title: "Continue Watching",
        queryKey: ["resumeItems", user.Id],
        queryFn: async () =>
          (
            await getItemsApi(api).getResumeItems({
              userId: user.Id,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
            })
          ).data.Items || [],
        type: "ScrollingCollectionList",
        orientation: "horizontal",
      },
      {
        title: "Next Up",
        queryKey: ["nextUp-all", user?.Id],
        queryFn: async () =>
          (
            await getTvShowsApi(api).getNextUp({
              userId: user?.Id,
              fields: ["MediaSourceCount"],
              limit: 20,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
            })
          ).data.Items || [],
        type: "ScrollingCollectionList",
        orientation: "horizontal",
      },
      ...(mediaListCollections?.map(
        (ml) =>
          ({
            title: ml.Name || "",
            queryKey: ["mediaList", ml.Id],
            queryFn: async () => ml,
            type: "MediaListSection",
          } as MediaListSection)
      ) || []),
      {
        title: "Recently Added in Movies",
        queryKey: ["recentlyAddedInMovies", user?.Id, movieCollectionId],
        queryFn: async () =>
          (
            await getUserLibraryApi(api).getLatestMedia({
              userId: user?.Id,
              limit: 50,
              fields: ["PrimaryImageAspectRatio", "Path"],
              imageTypeLimit: 1,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
              parentId: movieCollectionId,
            })
          ).data || [],
        type: "ScrollingCollectionList",
      },
      {
        title: "Recently Added in TV-Shows",
        queryKey: ["recentlyAddedInTVShows", user?.Id, tvShowCollectionId],
        queryFn: async () =>
          (
            await getUserLibraryApi(api).getLatestMedia({
              userId: user?.Id,
              limit: 50,
              fields: ["PrimaryImageAspectRatio", "Path"],
              imageTypeLimit: 1,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
              parentId: tvShowCollectionId,
            })
          ).data || [],
        type: "ScrollingCollectionList",
      },
      {
        title: "Suggestions",
        queryKey: ["suggestions", user?.Id],
        queryFn: async () =>
          (
            await getSuggestionsApi(api).getSuggestions({
              userId: user?.Id,
              limit: 5,
              mediaType: ["Video"],
            })
          ).data.Items || [],
        type: "ScrollingCollectionList",
        orientation: "horizontal",
      },
    ];
    return ss;
  }, [
    api,
    user?.Id,
    movieCollectionId,
    tvShowCollectionId,
    mediaListCollections,
  ]);

  // if (isConnected === false) {
  //   return (
  //     <View className="flex flex-col items-center justify-center h-full -mt-6 px-8">
  //       <Text className="text-3xl font-bold mb-2">No Internet</Text>
  //       <Text className="text-center opacity-70">
  //         No worries, you can still watch{"\n"}downloaded content.
  //       </Text>
  //       <View className="mt-4">
  //         <Button
  //           color="purple"
  //           onPress={() => router.push("/(auth)/downloads")}
  //           justify="center"
  //           iconRight={
  //             <Ionicons name="arrow-forward" size={20} color="white" />
  //           }
  //         >
  //           Go to downloads
  //         </Button>
  //       </View>
  //     </View>
  //   );
  // }

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
    >
      <View className="flex flex-col pt-4 pb-24 gap-y-4">
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
