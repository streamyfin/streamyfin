import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { ImageSource } from "expo-image";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { resolveItemImageUrl } from "@/utils/jellyfin/image/getItemImageUrl";
import type { ImageKind } from "@/utils/jellyfin/image/resolveItemImage";

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

const KIND_OF_VARIANT: Record<NonNullable<Props["variant"]>, ImageKind> = {
  Primary: "primary",
  Backdrop: "heroBackdrop",
  Thumb: "thumb",
  ParentBackdrop: "parentBackdrop",
  ParentLogo: "logo",
  Logo: "logo",
  AlbumPrimary: "album",
  SeriesPrimary: "poster",
  Screenshot: "screenshot",
};

export const getItemImage = ({
  item,
  api,
  variant = "Primary",
  quality = 90,
  width = 1000,
  height,
}: Props) => {
  if (!api) return null;

  const resolved = resolveItemImageUrl(api, item, KIND_OF_VARIANT[variant], {
    quality,
    width,
    height,
  });
  if (!resolved) return null;

  const src: ImageSource = {
    uri: resolved.url,
    blurhash: resolved.ref.blurhash,
  };

  // The consumers pass this straight to expo-image or download it, so the
  // proxy auth headers have to travel with the source rather than be added by
  // the <Image> wrapper.
  const headers = getJellyfinHeadersForUrl(resolved.url, api.basePath);
  return headers ? { ...src, headers } : src;
};
