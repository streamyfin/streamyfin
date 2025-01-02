import { AddToFavorites } from "@/components/AddToFavorites";
import { DownloadItems } from "@/components/DownloadItem";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { NextUp } from "@/components/series/NextUp";
import { SeasonPicker } from "@/components/series/SeasonPicker";
import { SeriesHeader } from "@/components/series/SeriesHeader";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { Ionicons } from "@expo/vector-icons";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, { useEffect, useMemo } from "react";
import { View } from "react-native";

const page: React.FC = () => {
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { id: seriesId, seasonIndex } = params as {
    id: string;
    seasonIndex: string;
  };

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data: item } = useQuery({
    queryKey: ["series", seriesId],
    queryFn: async () =>
      await getUserItemData({
        api,
        userId: user?.Id,
        itemId: seriesId,
      }),
    staleTime: 60 * 1000,
  });

  const backdropUrl = useMemo(
    () =>
      getBackdropUrl({
        api,
        item,
        quality: 90,
        width: 1000,
      }),
    [item]
  );

  const logoUrl = useMemo(
    () =>
      getLogoImageUrlById({
        api,
        item,
      }),
    [item]
  );

  const { data: allEpisodes, isLoading } = useQuery({
    queryKey: ["AllEpisodes", item?.Id],
    queryFn: async () => {
      const res = await getTvShowsApi(api!).getEpisodes({
        seriesId: item?.Id!,
        userId: user?.Id!,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview"],
      });
      return res?.data.Items || [];
    },
    staleTime: 60,
    enabled: !!api && !!user?.Id && !!item?.Id,
  });

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        !isLoading &&
        item &&
        allEpisodes &&
        allEpisodes.length > 0 && (
          <View className="flex flex-row items-center space-x-2">
            <AddToFavorites item={item} type="series" />
            <DownloadItems
              size="large"
              title="Download Series"
              items={allEpisodes || []}
              MissingDownloadIconComponent={() => (
                <Ionicons name="download" size={22} color="white" />
              )}
              DownloadedIconComponent={() => (
                <Ionicons
                  name="checkmark-done-outline"
                  size={24}
                  color="#9333ea"
                />
              )}
            />
          </View>
        ),
    });
  }, [allEpisodes, isLoading, item]);

  if (!item || !backdropUrl) return null;

  return (
    <ParallaxScrollView
      headerHeight={400}
      headerImage={
        <Image
          source={{
            uri: backdropUrl,
          }}
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      }
      logo={
        <>
          {logoUrl ? (
            <Image
              source={{
                uri: logoUrl,
              }}
              style={{
                height: 130,
                width: "100%",
                resizeMode: "contain",
              }}
            />
          ) : null}
        </>
      }
    >
      <View className="flex flex-col pt-4">
        <SeriesHeader item={item} />
        <View className="mb-4">
          <NextUp seriesId={seriesId} />
        </View>
        <SeasonPicker item={item} initialSeasonIndex={Number(seasonIndex)} />
      </View>
    </ParallaxScrollView>
  );
};

export default page;
