import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image, type ImageProps } from "expo-image";
import { useAtom } from "jotai";
import { type FC, useMemo } from "react";
import { View, type ViewProps } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";
import { getItemImage } from "@/utils/getItemImage";
import { getStoredImage } from "@/utils/storedImages";

interface Props extends ImageProps {
  item: BaseItemDto;
  variant?:
    | "Primary"
    | "Backdrop"
    | "ParentBackdrop"
    | "ParentLogo"
    | "Logo"
    | "AlbumPrimary"
    | "SeriesPrimary"
    | "Screenshot"
    | "Thumb";
  quality?: number;
  width?: number;
  onError?: () => void;
}

export const ItemImage: FC<Props> = ({
  item,
  variant = "Primary",
  quality = 90,
  width = 1000,
  onError,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const { offlineMode } = useOfflineLibrary();

  const source = useMemo(() => {
    // When offline, check for stored images first
    if (offlineMode || !api) {
      // For audio items, prefer album artwork
      let storedImage: string | undefined;
      if (
        item.AlbumId &&
        (item.Type === "Audio" || item.Type === "AudioBook")
      ) {
        storedImage = getStoredImage(item.AlbumId);
      }
      // For series images on episodes
      if (
        !storedImage &&
        item.SeriesId &&
        item.Type === "Episode" &&
        variant === "SeriesPrimary"
      ) {
        storedImage = getStoredImage(item.SeriesId);
      }
      // Try the item's own stored image
      if (!storedImage) {
        storedImage = getStoredImage(item.Id);
      }

      if (storedImage) {
        return { uri: storedImage, blurhash: undefined };
      }

      // No stored image found and offline
      if (!api) {
        onError?.();
        return;
      }
    }

    // Online mode: fetch from server
    return getItemImage({
      item,
      api,
      variant,
      quality,
      width,
    });
  }, [api, item, quality, variant, width, offlineMode]);

  // return placeholder icon if no source
  if (!source?.uri)
    return (
      <View
        {...(props as ViewProps)}
        className='flex flex-col items-center justify-center border border-neutral-800 bg-neutral-900'
      >
        <Ionicons
          name='image-outline'
          size={24}
          color='white'
          style={{ opacity: 0.4 }}
        />
      </View>
    );

  return (
    <Image
      cachePolicy={"memory-disk"}
      transition={300}
      placeholder={{
        blurhash: source?.blurhash,
      }}
      style={{
        width: "100%",
        height: "100%",
      }}
      source={{
        uri: source?.uri,
      }}
      {...props}
    />
  );
};
