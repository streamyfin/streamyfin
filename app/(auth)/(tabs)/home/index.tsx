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
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, View } from "react-native";

export default function index() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { i18n, t } = useTranslation();

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

  const { data, isLoading, isError } = useQuery<BaseItemDto[]>({
    queryKey: ["resumeItems", user?.Id],
    queryFn: async () =>
      (api &&
        (
          await getItemsApi(api).getResumeItems({
            userId: user?.Id,
          })
        ).data.Items) ||
      [],
    enabled: !!api && !!user?.Id,
    staleTime: 60 * 1000,
  });

  const { data: _nextUpData, isLoading: isLoadingNextUp } = useQuery({
    queryKey: ["nextUp-all", user?.Id],
    queryFn: async () =>
      (api &&
        (
          await getTvShowsApi(api).getNextUp({
            userId: user?.Id,
            fields: ["MediaSourceCount"],
          })
        ).data.Items) ||
      [],
    enabled: !!api && !!user?.Id,
    staleTime: 0,
  });

  const nextUpData = useMemo(() => {
    return _nextUpData?.filter((i) => !data?.find((d) => d.Id === i.Id));
  }, [_nextUpData]);

  const { data: collections } = useQuery({
    queryKey: ["collectinos", user?.Id],
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

  const movieCollectionId = useMemo(() => {
    return collections?.find((c) => c.CollectionType === "movies")?.Id;
  }, [collections]);

  const tvShowCollectionId = useMemo(() => {
    return collections?.find((c) => c.CollectionType === "tvshows")?.Id;
  }, [collections]);

  const {
    data: recentlyAddedInMovies,
    isLoading: isLoadingRecentlyAddedMovies,
  } = useQuery<BaseItemDto[]>({
    queryKey: ["recentlyAddedInMovies", user?.Id, movieCollectionId],
    queryFn: async () =>
      (api &&
        (
          await getUserLibraryApi(api).getLatestMedia({
            userId: user?.Id,
            limit: 50,
            fields: ["PrimaryImageAspectRatio", "Path"],
            imageTypeLimit: 1,
            enableImageTypes: ["Primary", "Backdrop", "Thumb"],
            parentId: movieCollectionId,
          })
        ).data) ||
      [],
    enabled: !!api && !!user?.Id && !!movieCollectionId,
    staleTime: 60 * 1000,
  });

  const {
    data: recentlyAddedInTVShows,
    isLoading: isLoadingRecentlyAddedTVShows,
  } = useQuery<BaseItemDto[]>({
    queryKey: ["recentlyAddedInTVShows", user?.Id, tvShowCollectionId],
    queryFn: async () =>
      (api &&
        (
          await getUserLibraryApi(api).getLatestMedia({
            userId: user?.Id,
            limit: 50,
            fields: ["PrimaryImageAspectRatio", "Path"],
            imageTypeLimit: 1,
            enableImageTypes: ["Primary", "Backdrop", "Thumb"],
            parentId: tvShowCollectionId,
          })
        ).data) ||
      [],
    enabled: !!api && !!user?.Id && !!tvShowCollectionId,
    staleTime: 60 * 1000,
  });

  const { data: suggestions, isLoading: isLoadingSuggestions } = useQuery<
    BaseItemDto[]
  >({
    queryKey: ["suggestions", user?.Id],
    queryFn: async () =>
      (api &&
        (
          await getSuggestionsApi(api).getSuggestions({
            userId: user?.Id,
            limit: 5,
            mediaType: ["Video"],
          })
        ).data.Items) ||
      [],
    enabled: !!api && !!user?.Id,
    staleTime: 60 * 1000,
  });

  const { data: mediaListCollections } = useQuery({
    queryKey: [
      "mediaListCollections-home",
      user?.Id,
      settings?.mediaListCollectionIds,
    ],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        tags: ["medialist", "promoted"],
        recursive: true,
        fields: ["Tags"],
        includeItemTypes: ["BoxSet"],
      });

      const ids =
        response.data.Items?.filter(
          (c) =>
            c.Name !== "cf_carousel" &&
            settings?.mediaListCollectionIds?.includes(c.Id!)
        ) ?? [];

      return ids;
    },
    enabled: !!api && !!user?.Id && settings?.usePopularPlugin === true,
    staleTime: 0,
  });

  const refetch = useCallback(async () => {
    setLoading(true);
    await queryClient.refetchQueries({ queryKey: ["resumeItems"] });
    await queryClient.refetchQueries({ queryKey: ["nextUp-all"] });
    await queryClient.refetchQueries({ queryKey: ["recentlyAddedInMovies"] });
    await queryClient.refetchQueries({ queryKey: ["recentlyAddedInTVShows"] });
    await queryClient.refetchQueries({ queryKey: ["suggestions"] });
    await queryClient.refetchQueries({
      queryKey: ["mediaListCollections-home"],
    });
    setLoading(false);
  }, [queryClient, user?.Id]);

  if (isConnected === false) {
    return (
      <View className="flex flex-col items-center justify-center h-full -mt-6 px-8">
        <Text className="text-3xl font-bold mb-2">{t("home.noInternet")}</Text>
        <Text className="text-center opacity-70">
          {t("home.noInternetMessage")}
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
            {t("home.goToDownloads")}
          </Button>
        </View>
      </View>
    );
  }

  if (isError)
    return (
      <View className="flex flex-col items-center justify-center h-full -mt-6">
        <Text className="text-3xl font-bold mb-2">{t("home.oops")}</Text>
        <Text className="text-center opacity-70">{t("home.errorMessage")}</Text>
      </View>
    );

  if (isLoading)
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

        <ScrollingCollectionList
          title={t("home.continueWatching")}
          data={data}
          loading={isLoading}
          orientation="horizontal"
        />

        <ScrollingCollectionList
          title={t("home.nextUp")}
          data={nextUpData}
          loading={isLoadingNextUp}
          orientation="horizontal"
        />

        {mediaListCollections?.map((ml) => (
          <MediaListSection key={ml.Id} collection={ml} />
        ))}

        <ScrollingCollectionList
          title={t("home.recentlyAddedMovies")}
          data={recentlyAddedInMovies}
          loading={isLoadingRecentlyAddedMovies}
        />

        <ScrollingCollectionList
          title={t("home.recentlyAddedTVShows")}
          data={recentlyAddedInTVShows}
          loading={isLoadingRecentlyAddedTVShows}
        />

        <ScrollingCollectionList
          title={t("home.suggestions")}
          data={suggestions}
          loading={isLoadingSuggestions}
          orientation="horizontal"
        />
      </View>
    </ScrollView>
  );
}
