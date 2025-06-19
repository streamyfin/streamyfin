import { Ionicons } from "@expo/vector-icons";
import {
  type BaseItemDto,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useState } from "react";
import { View, type ViewProps } from "react-native";
import { WatchedIndicator } from "../WatchedIndicator";
import { ItemImage } from "../common/ItemImage";

interface Props extends ViewProps {
  item: BaseItemDto;
  showProgress?: boolean;
}

export const ItemPoster: React.FC<Props> = ({
  item,
  showProgress,
  ...props
}) => {
  const [progress, setProgress] = useState(
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

  if (item.Type === "Folder") {
    return (
      <View
        className='relative rounded-lg overflow-hidden border border-neutral-900'
        {...props}
      >
        <ItemImage className='w-full aspect-square' item={item} />
        <View className='absolute top-2 right-2 bg-neutral-800/80 rounded-full p-1'>
          <Ionicons name='folder' size={20} color='white' />
        </View>
      </View>
    );
  }

  if (item.Type === "PhotoAlbum") {
    return (
      <View
        className='relative rounded-lg overflow-hidden border border-neutral-900'
        {...props}
      >
        <ItemImage className='w-full aspect-square' item={item} />
        <View className='absolute top-2 right-2 bg-neutral-800/80 rounded-full p-1'>
          <Ionicons name='images' size={20} color='white' />
        </View>
      </View>
    );
  }

  if (item.Type === "Photo") {
    return (
      <View
        className='relative rounded-lg overflow-hidden border border-neutral-900'
        {...props}
      >
        <ItemImage className='w-full aspect-square' item={item} />
        <View className='absolute top-2 right-2 bg-neutral-800/80 rounded-full p-1'>
          <Ionicons name='image' size={20} color='white' />
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
