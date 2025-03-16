import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { ImageSource } from "expo-image";

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
          uri: `${api.basePath}/Items/${item.ParentBackdropItemId}/Images/Backdrop/0?quality=${quality}&tag=${tag}&width=${width}`,
          blurhash,
        };
        break;
      }

      tag = item.BackdropImageTags?.[0];
      if (!tag) break;
      blurhash = item.ImageBlurHashes?.Backdrop?.[tag];
      src = {
        uri: `${api.basePath}/Items/${item.Id}/Images/Backdrop/0?quality=${quality}&tag=${tag}&width=${width}`,
        blurhash,
      };
      break;
    case "Primary":
      tag = item.ImageTags?.["Primary"];
      if (!tag) break;
      blurhash = item.ImageBlurHashes?.Primary?.[tag];

      src = {
        uri: `${api.basePath}/Items/${item.Id}/Images/Primary?quality=${quality}&tag=${tag}&width=${width}`,
        blurhash,
      };
      break;
    case "Thumb":
      tag = item.ImageTags?.["Thumb"];
      if (!tag) break;
      blurhash = item.ImageBlurHashes?.Thumb?.[tag];

      src = {
        uri: `${api.basePath}/Items/${item.Id}/Images/Backdrop?quality=${quality}&tag=${tag}&width=${width}`,
        blurhash,
      };
      break;
    default:
      tag = item.ImageTags?.["Primary"];
      src = {
        uri: `${api.basePath}/Items/${item.Id}/Images/Primary?quality=${quality}&tag=${tag}&width=${width}`,
      };
      break;
  }

  if (!src?.uri) return null;

  return src;
};
