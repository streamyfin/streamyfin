import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { useChannelFavoriteSheet } from "@/components/livetv/ChannelFavoriteSheet";
import { Colors } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { useFavorite } from "@/hooks/useFavorite";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const ChannelItem: React.FC<{ channel: BaseItemDto }> = ({ channel }) => {
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorite(channel);
  const showFavoriteSheet = useChannelFavoriteSheet();

  const handlePress = useCallback(() => {
    const params = new URLSearchParams({
      itemId: channel.Id!,
      audioIndex: "0",
      subtitleIndex: "-1",
      mediaSourceId: "",
      bitrateValue: "",
      playbackPosition: "0",
      offline: "false",
    });
    router.push(`/player/direct-player?${params.toString()}`);
  }, [channel.Id, router]);

  const handleLongPress = useCallback(() => {
    showFavoriteSheet(channel, !!isFavorite, toggleFavorite);
  }, [showFavoriteSheet, channel, isFavorite, toggleFavorite]);

  const progress = useMemo(() => {
    const p = channel.CurrentProgram;
    if (!p?.StartDate || !p?.EndDate) return null;
    const start = new Date(p.StartDate).getTime();
    const end = new Date(p.EndDate).getTime();
    const now = Date.now();
    if (now < start || now > end) return null;
    return Math.min(1, Math.max(0, (now - start) / (end - start)));
  }, [channel.CurrentProgram]);

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
            size={14}
            color={isFavorite ? Colors.primary : "#737373"}
            style={{ marginRight: 4 }}
          />
        </TouchableOpacity>
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: "rgba(255,255,255,0.08)",
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

export default function page() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const _insets = useSafeAreaInsets();

  const { data: channels } = useQuery({
    queryKey: ["livetv", "channels"],
    queryFn: async () => {
      const res = await getLiveTvApi(api!).getLiveTvChannels({
        startIndex: 0,
        limit: 500,
        enableFavoriteSorting: true,
        userId: user?.Id,
        addCurrentProgram: true,
        enableUserData: true,
        enableImageTypes: ["Primary"],
      });
      return res.data;
    },
  });

  return (
    <View className='flex flex-1'>
      <FlashList
        data={channels?.Items}
        renderItem={({ item }) => <ChannelItem channel={item} />}
      />
    </View>
  );
}
