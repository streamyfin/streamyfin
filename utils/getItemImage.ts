import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { ImageSource } from "expo-image";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { fillHeightParams } from "@/utils/jellyfin/image/imagePixels";

interface Props {
  item: BaseItemDto;
  api: Api;
  quality?: number;
  /** Image width in physical pixels, not layout points. */
  width?: number;
  /**
   * Height of the box the image has to cover, in physical pixels. With it the
   * request becomes "cover a `width` by `height` box" instead of a fixed width.
   */
  height?: number;
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
}

export const getItemImage = ({
  item,
  api,
  variant = "Primary",
  quality = 90,
  width = 1000,
  height,
}: Props) => {
  if (!api) return null;

  const size = height
    ? new URLSearchParams({
        fillWidth: String(Math.round(width)),
        ...fillHeightParams(height),
      }).toString()
    : `width=${width}`;

  let tag: string | null | undefined;
  let blurhash: string | null | undefined;
  let src: ImageSource | null = null;

  switch (variant) {
    case "Backdrop":
      if (item.Type === "Episode") {
        tag = item.ParentBackdropImageTags?.[0];
        if (!tag) break;
        blurhash = item.ImageBlurHashes?.Backdrop?.[tag];
        src = {
          uri: `${api.basePath}/Items/${item.ParentBackdropItemId}/Images/Backdrop/0?quality=${quality}&tag=${tag}&${size}`,
          blurhash,
        };
        break;
      }

      tag = item.BackdropImageTags?.[0];
      if (!tag) break;
      blurhash = item.ImageBlurHashes?.Backdrop?.[tag];
      src = {
        uri: `${api.basePath}/Items/${item.Id}/Images/Backdrop/0?quality=${quality}&tag=${tag}&${size}`,
        blurhash,
      };
      break;
    case "Primary":
      tag = item.ImageTags?.Primary;
      if (!tag) break;
      blurhash = item.ImageBlurHashes?.Primary?.[tag];

      src = {
        uri: `${api.basePath}/Items/${item.Id}/Images/Primary?quality=${quality}&tag=${tag}&${size}`,
        blurhash,
      };
      break;
    case "Thumb":
      tag = item.ImageTags?.Thumb;
      if (!tag) break;
      blurhash = item.ImageBlurHashes?.Thumb?.[tag];

      src = {
        uri: `${api.basePath}/Items/${item.Id}/Images/Backdrop?quality=${quality}&tag=${tag}&${size}`,
        blurhash,
      };
      break;
    default:
      tag = item.ImageTags?.Primary;
      src = {
        uri: `${api.basePath}/Items/${item.Id}/Images/Primary?quality=${quality}&tag=${tag}&${size}`,
      };
      break;
  }

  if (!src?.uri) return null;

  // The consumers pass this straight to expo-image or download it, so the
  // proxy auth headers have to travel with the source rather than be added by
  // the <Image> wrapper.
  const headers = getJellyfinHeadersForUrl(src.uri, api.basePath);
  return headers ? { ...src, headers } : src;
};
