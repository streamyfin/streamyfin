import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import {
  EPG_BORDER_COLOR,
  EPG_FAVORITE_ICON_SIZE,
  EPG_ICON_COLOR_INACTIVE,
  EPG_PROGRESS_BAR_HEIGHT,
} from "@/components/livetv/constants";
import { useChannelPress } from "@/components/livetv/useChannelPress";
import { Colors } from "@/constants/Colors";
import { useFavorite } from "@/hooks/useFavorite";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const ChannelItem: React.FC<{ channel: BaseItemDto; now: number }> = ({
  channel,
  now,
}) => {
  const { isFavorite, toggleFavorite } = useFavorite(channel);
  const { onPress: handlePress, onLongPress: handleLongPress } =
    useChannelPress(channel);

  const progress = useMemo(() => {
    const p = channel.CurrentProgram;
    if (!p?.StartDate || !p?.EndDate) return null;
    const start = new Date(p.StartDate).getTime();
    const end = new Date(p.EndDate).getTime();
    if (now < start || now > end) return null;
    return Math.min(1, Math.max(0, (now - start) / (end - start)));
  }, [channel.CurrentProgram, now]);

  return (
    <TouchableOpacity onPress={handlePress} onLongPress={handleLongPress}>
      <View className='flex flex-row items-center px-4 pt-2 pb-1'>
        <View className='w-22 mr-4 rounded-lg overflow-hidden'>
          <ItemImage
            style={{
              aspectRatio: "1/1",
              width: 60,
              borderRadius: 8,
            }}
            contentFit='contain'
            item={channel}
          />
        </View>
        <View className='flex-1 justify-center'>
          <Text className='font-bold' numberOfLines={1}>
            {channel.Name}
          </Text>
          {channel.CurrentProgram?.Name ? (
            <Text
              className='text-xs text-neutral-400'
              numberOfLines={1}
              style={{ fontStyle: "italic" }}
            >
              {channel.CurrentProgram.Name}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={toggleFavorite} hitSlop={16}>
          <Ionicons
            name={isFavorite ? "heart" : "heart-outline"}
            size={EPG_FAVORITE_ICON_SIZE}
            color={isFavorite ? Colors.primary : EPG_ICON_COLOR_INACTIVE}
            style={{ marginRight: 4 }}
          />
        </TouchableOpacity>
      </View>
      <View
        style={{
          height: EPG_PROGRESS_BAR_HEIGHT,
          backgroundColor: EPG_BORDER_COLOR,
          marginHorizontal: 16,
          marginBottom: 6,
          borderRadius: 1,
        }}
      >
        {progress !== null && (
          <View
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              backgroundColor: Colors.primary,
              borderRadius: 1,
            }}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

export default function LiveTvChannelsPage() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { data: channels } = useQuery({
    queryKey: ["livetv", "channels", "base", user?.Id],
    queryFn: async () => {
      const res = await getLiveTvApi(api!).getLiveTvChannels({
        startIndex: 0,
        limit: 500,
        enableFavoriteSorting: true,
        userId: user?.Id,
        addCurrentProgram: false,
        enableUserData: true,
        enableImageTypes: ["Primary"],
      });
      return res.data;
    },
    staleTime: 3 * 60 * 1000,
    // The page can mount before the api and the user are restored; the
    // channels carry the user's favorites.
    enabled: !!api && !!user?.Id,
  });

  const channelIds = useMemo(
    () => (channels?.Items ?? []).map((c) => c.Id!).filter(Boolean),
    [channels],
  );

  const { data: currentPrograms } = useQuery({
    queryKey: ["livetv", "channels", "currentPrograms", channelIds],
    queryFn: async () => {
      const now = new Date();
      const res = await getLiveTvApi(api!).getPrograms({
        getProgramsDto: {
          ChannelIds: channelIds,
          MinEndDate: now.toISOString(),
          MaxStartDate: now.toISOString(),
          EnableImages: false,
          EnableTotalRecordCount: false,
          EnableUserData: false,
        },
      });
      return res.data.Items ?? [];
    },
    // The channels can come back from the persisted cache before the api does.
    enabled: !!api && channelIds.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // One clock for every row's progress bar.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const programByChannelId = useMemo(() => {
    const map = new Map<string, BaseItemDto>();
    for (const p of currentPrograms ?? []) {
      if (p.ChannelId) map.set(p.ChannelId, p);
    }
    return map;
  }, [currentPrograms]);

  const items = useMemo(
    () =>
      (channels?.Items ?? []).map((c) => {
        const program = c.Id ? programByChannelId.get(c.Id) : undefined;
        // A failed refetch keeps the last result: a program that has ended
        // is not current any more.
        const airing =
          program?.StartDate &&
          program.EndDate &&
          new Date(program.StartDate).getTime() <= now &&
          now < new Date(program.EndDate).getTime();
        return airing ? { ...c, CurrentProgram: program } : c;
      }),
    [channels, programByChannelId, now],
  );

  return (
    <View className='flex flex-1'>
      <FlashList
        data={items}
        extraData={now}
        renderItem={({ item }) => <ChannelItem channel={item} now={now} />}
      />
    </View>
  );
}
