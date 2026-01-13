import { Ionicons } from "@expo/vector-icons";
import { type BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useState } from "react";
import { View, type ViewProps } from "react-native";
import { ItemImage } from "../common/ItemImage";
import { WatchedIndicator } from "../WatchedIndicator";

// Icon configuration for item types with badge overlays
const ITEM_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Folder: "folder",
  PhotoAlbum: "images",
  Photo: "image",
};

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

  // Handle Folder, PhotoAlbum, and Photo types with icon badge
  const iconName = item.Type ? ITEM_TYPE_ICONS[item.Type] : undefined;
  if (iconName) {
    return (
      <View
        className='relative rounded-lg overflow-hidden border border-neutral-900'
        {...props}
      >
        <ItemImage className='w-full aspect-square' item={item} />
        <View className='absolute top-2 right-2 bg-neutral-800/80 rounded-full p-1'>
          <Ionicons name={iconName} size={20} color='white' />
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
