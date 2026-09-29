import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getImageApi } from "@jellyfin/sdk/lib/utils/api";
import type { ImageSource } from "expo-image";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";

interface Props {
  item: BaseItemDto;
  api: Api;
  quality?: number;
  width?: number;
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
}: Props) => {
  if (!api) return null;
  const images = getImageApi(api);

  let tag: string | null | undefined;
  let blurhash: string | undefined;
  let src: ImageSource | null = null;

  switch (variant) {
    case "Backdrop":
      if (item.Type === "Episode") {
        tag = item.ParentBackdropImageTags?.[0];
        if (!tag) break;
        blurhash = item.ImageBlurHashes?.Backdrop?.[tag] ?? undefined;
        src = {
          uri: images.getItemImageUrlById(
            item.ParentBackdropItemId!,
            "Backdrop",
            {
              quality,
              tag,
              width,
              imageIndex: 0,
            },
          ),
          blurhash,
        };
        break;
      }

      tag = item.BackdropImageTags?.[0];
      if (!tag) break;
      blurhash = item.ImageBlurHashes?.Backdrop?.[tag] ?? undefined;
      src = {
        uri: images.getItemImageUrlById(item.Id!, "Backdrop", {
          quality,
          tag,
          width,
          imageIndex: 0,
        }),
        blurhash,
      };
      break;
    case "Primary":
      tag = item.ImageTags?.Primary;
      if (!tag) break;
      blurhash = item.ImageBlurHashes?.Primary?.[tag] ?? undefined;

      src = {
        uri: images.getItemImageUrlById(item.Id!, "Primary", {
          quality,
          tag,
          width,
        }),
        blurhash,
      };
      break;
    case "Thumb":
      tag = item.ImageTags?.Thumb;
      if (!tag) break;
      blurhash = item.ImageBlurHashes?.Thumb?.[tag] ?? undefined;

      src = {
        uri: images.getItemImageUrlById(item.Id!, "Backdrop", {
          quality,
          tag,
          width,
        }),
        blurhash,
      };
      break;
    default:
      tag = item.ImageTags?.Primary;
      src = {
        uri: images.getItemImageUrlById(item.Id!, "Primary", {
          quality,
          tag: String(tag),
          width,
        }),
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
