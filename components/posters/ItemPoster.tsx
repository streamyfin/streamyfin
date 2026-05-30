import { Ionicons } from "@expo/vector-icons";
import { type BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useState } from "react";
import { View, type ViewProps } from "react-native";
import { ItemImage } from "../common/ItemImage";
import { WatchedIndicator } from "../WatchedIndicator";

interface Props extends ViewProps {
  item: BaseItemDto;
  showProgress?: boolean;
}

export const ItemPoster: React.FC<Props> = ({
  item,
  showProgress,
  ...props
}) => {
  const [progress, _setProgress] = useState(
    item.UserData?.PlayedPercentage || 0,
  );

  if (item.Type === "Movie" || item.Type === "Series" || item.Type === "BoxSet")
    return (
      <View
        className='relative rounded-lg overflow-hidden border border-neutral-900'
        {...props}
      >
        <ItemImage
          style={{
            aspectRatio: "10/15",
            width: "100%",
          }}
          item={item}
        />
        <WatchedIndicator item={item} />
        {showProgress && progress > 0 && (
          <View className='h-1 bg-red-600 w-full' />
        )}
      </View>
    );

  // Channel folder item - show folder icon overlay
  if (item.Type === "ChannelFolderItem") {
    return (
      <View
        className='rounded-lg w-full aspect-square overflow-hidden border border-neutral-900 relative'
        {...props}
      >
        <ItemImage className='w-full aspect-square' item={item} />
        <View className='absolute bottom-1 right-1 bg-black/60 rounded p-1'>
          <Ionicons name='folder' size={16} color='white' />
        </View>
      </View>
    );
  }

  // Channel audio item - show audio icon overlay
  if (item.Type === "Audio" || item.MediaType === "Audio") {
    return (
      <View
        className='rounded-lg w-full aspect-square overflow-hidden border border-neutral-900 relative'
        {...props}
      >
        <ItemImage className='w-full aspect-square' item={item} />
        <View className='absolute bottom-1 right-1 bg-black/60 rounded p-1'>
          <Ionicons name='musical-note' size={16} color='white' />
        </View>
      </View>
    );
  }

  return (
    <View
      className='rounded-lg w-full aspect-square overflow-hidden border border-neutral-900'
      {...props}
    >
      <ItemImage className='w-full aspect-square' item={item} />
    </View>
  );
};
