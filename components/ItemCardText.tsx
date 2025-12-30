import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { runtimeTicksToMinutes } from "@/utils/time";
import { Text } from "./common/Text";

type ItemCardProps = {
  item: BaseItemDto;
};

export const ItemCardText: React.FC<ItemCardProps> = ({ item }) => {
  const { t } = useTranslation();

  // Channel folder item
  if (item.Type === "ChannelFolderItem") {
    return (
      <View className='mt-2 flex flex-col'>
        <Text numberOfLines={1} ellipsizeMode='tail'>
          {item.Name}
        </Text>
        <Text className='text-xs opacity-50'>{t("channels.folder")}</Text>
      </View>
    );
  }

  // Channel video or audio item
  if (item.ChannelId) {
    return (
      <View className='mt-2 flex flex-col'>
        <Text numberOfLines={1} ellipsizeMode='tail'>
          {item.Name}
        </Text>
        <Text className='text-xs opacity-50'>
          {item.RunTimeTicks ? runtimeTicksToMinutes(item.RunTimeTicks) : ""}
        </Text>
      </View>
    );
  }

  return (
    <View className='mt-2 flex flex-col'>
      {item.Type === "Episode" ? (
        <>
          <Text numberOfLines={1} ellipsizeMode='tail' className=''>
            {item.Name}
          </Text>
          <Text numberOfLines={1} className='text-xs opacity-50'>
            {`S${item.ParentIndexNumber?.toString()}:E${item.IndexNumber?.toString()}`}
            {" - "}
            {item.SeriesName}
          </Text>
        </>
      ) : item.Type === "MusicAlbum" ? (
        <>
          <Text
            numberOfLines={1}
            ellipsizeMode='tail'
            className='font-semibold'
          >
            {item.Name}
          </Text>
          <Text numberOfLines={1} className='text-xs opacity-50'>
            {item.AlbumArtist ||
              item.AlbumArtists?.[0]?.Name ||
              "Unknown Artist"}
          </Text>
        </>
      ) : item.Type === "Audio" ? (
        <>
          <Text
            numberOfLines={1}
            ellipsizeMode='tail'
            className='font-semibold'
          >
            {item.Name}
          </Text>
          <Text numberOfLines={1} className='text-xs opacity-50'>
            {item.Artists?.join(", ") || item.AlbumArtist || "Unknown Artist"}
          </Text>
        </>
      ) : (
        <>
          <Text numberOfLines={1} ellipsizeMode='tail'>
            {item.Name}
          </Text>
          <Text className='text-xs opacity-50'>{item.ProductionYear}</Text>
        </>
      )}
    </View>
  );
};
