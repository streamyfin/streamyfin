import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { runtimeTicksToSeconds } from "@/utils/time";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState, useRef } from "react";
import { View, TouchableOpacity } from "react-native";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Loader } from "@/components/Loader";
import ContinueWatchingPoster from "@/components/ContinueWatchingPoster";
import { Text } from "@/components/common/Text";
import { DownloadSingleItem } from "@/components/DownloadItem";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  HorizontalScroll,
  HorizontalScrollRef,
} from "@/components/common/HorrizontalScroll";
import { router } from "expo-router";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getItemById } from "@/utils/jellyfin/user-library/getItemById";
import { useSettings } from "@/utils/atoms/settings";

type Props = {
  item: BaseItemDto;
  close: () => void;
};

export const EpisodeList: React.FC<Props> = ({ item, close }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const scrollViewRef = useRef<HorizontalScrollRef>(null); // Reference to the HorizontalScroll
  const insets = useSafeAreaInsets(); // Get safe area insets
  const [settings] = useSettings();
  const SeasonId = item.ParentId;

  const { data: episodes, isFetching } = useQuery({
    queryKey: ["episodes", SeasonId],
    queryFn: async () => {
      if (!api || !user?.Id || !item.Id || !SeasonId) return [];
      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.Id,
        userId: user.Id,
        seasonId: SeasonId,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview"],
      });

      return res.data.Items;
    },
    enabled: !!api && !!user?.Id && !!item.Id && !!SeasonId,
  });

  const queryClient = useQueryClient();
  useEffect(() => {
    for (let e of episodes || []) {
      queryClient.prefetchQuery({
        queryKey: ["item", e.Id],
        queryFn: async () => {
          if (!e.Id) return;
          const res = await getUserItemData({
            api,
            userId: user?.Id,
            itemId: e.Id,
          });
          return res;
        },
        staleTime: 60 * 5 * 1000,
      });
    }
  }, [episodes]);

  // Used for width calculation
  const [nrOfEpisodes, setNrOfEpisodes] = useState(0);
  useEffect(() => {
    if (episodes && episodes.length > 0) {
      setNrOfEpisodes(episodes.length);
    }
  }, [episodes]);

  // Scroll to the current item when episodes are fetched
  useEffect(() => {
    if (episodes && scrollViewRef.current) {
      const currentItemIndex = episodes.findIndex((e) => e.Id === item.Id);
      if (currentItemIndex !== -1) {
        scrollViewRef.current.scrollToIndex(currentItemIndex, 16); // Adjust the scroll position based on item width
      }
    }
  }, [episodes, item.Id]);

  const gotoEpisode = async (itemId: string) => {
    const item = await getItemById(api, itemId);
    console.log("Item", item);
    if (!settings || !item) return;

    const { bitrate, mediaSource, audioIndex, subtitleIndex } =
      getDefaultPlaySettings(item, settings);

    const queryParams = new URLSearchParams({
      itemId: item.Id ?? "", // Ensure itemId is a string
      audioIndex: audioIndex?.toString() ?? "",
      subtitleIndex: subtitleIndex?.toString() ?? "",
      mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
      bitrateValue: bitrate.toString(),
    }).toString();

    if (!bitrate.value) {
      // @ts-expect-error
      router.replace(`player/direct-player?${queryParams}`);
      return;
    }
    // @ts-expect-error
    router.replace(`player/transcoding-player?${queryParams}`);
  };

  return (
    <View
      style={{
        position: "absolute",
        top: insets.top,
        left: insets.left,
        right: insets.right,
        bottom: insets.bottom,
        backgroundColor: "rgba(0, 0, 0, 0.85)", // Dark transparent background
      }}
    >
      {isFetching ? (
        <View
          style={{
            minWidth: 144 * nrOfEpisodes,
          }}
          className="flex flex-col items-center justify-center"
        >
          <Loader />
        </View>
      ) : (
        <>
          <View
            style={{
              position: "absolute",
              top: insets.top,
              right: insets.right,
              zIndex: 10,
              padding: 16,
            }}
            className={`flex flex-row items-center space-x-2`}
          >
            <TouchableOpacity
              onPress={async () => {
                close();
              }}
              className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <View
            style={{
              position: "absolute",
              bottom: insets.bottom,
              width: "100%",
              paddingBottom: 16, // Add padding to stay within the safe area
            }}
          >
            <HorizontalScroll
              ref={scrollViewRef} // Attach the reference to the HorizontalScroll
              data={episodes}
              extraData={item}
              renderItem={(_item, idx) => (
                <View
                  key={_item.Id}
                  className={`flex flex-col w-44 
                    ${item?.Id === _item.Id ? "" : "opacity-50"}
                  `}
                >
                  <TouchableOpacity
                    onPress={() => {
                      gotoEpisode(_item.Id);
                    }}
                  >
                    <ContinueWatchingPoster
                      item={_item}
                      useEpisodePoster
                      showPlayButton={_item.id != item.Id}
                    />
                  </TouchableOpacity>
                  <View className="shrink">
                    <Text numberOfLines={2} className="">
                      {_item.Name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-xs text-neutral-500"
                    >
                      {`S${_item.ParentIndexNumber?.toString()}:E${_item.IndexNumber?.toString()}`}
                    </Text>
                    <Text className="text-xs text-neutral-500">
                      {runtimeTicksToSeconds(_item.RunTimeTicks)}
                    </Text>
                  </View>
                  <View className="self-start mt-2">
                    <DownloadSingleItem item={_item} />
                  </View>
                  <Text
                    numberOfLines={5}
                    className="text-xs text-neutral-500 shrink"
                  >
                    {_item.Overview}
                  </Text>
                </View>
              )}
              keyExtractor={(e: BaseItemDto) => e.Id}
              estimatedItemSize={200}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
              }}
            />
          </View>
        </>
      )}
    </View>
  );
};
