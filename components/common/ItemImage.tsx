import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { ImageProps } from "expo-image";
import { useAtom } from "jotai";
import { type FC, useMemo } from "react";
import { View, type ViewProps } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getItemImage } from "@/utils/getItemImage";

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
  /** Requested image width in physical pixels, not layout points. */
  width?: number;
  /**
   * Height of the box the image covers, in physical pixels. Pass it with
   * `width` for a cover fit image, so the request is sized to the box.
   */
  height?: number;
  onError?: () => void;
}

export const ItemImage: FC<Props> = ({
  item,
  variant = "Primary",
  quality = 90,
  width = 1000,
  height,
  onError,
  ...props
}) => {
  const [api] = useAtom(apiAtom);

  const source = useMemo(() => {
    if (!api) {
      onError?.();
      return;
    }
    return getItemImage({
      item,
      api,
      variant,
      quality,
      width,
      height,
    });
  }, [api, item, quality, variant, width, height]);

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
      // Pass the uri only: ServerImage resolves the server's proxy auth headers
      // from it (and re-resolves them when the custom headers change).
      source={source?.uri}
      {...props}
    />
  );
};
