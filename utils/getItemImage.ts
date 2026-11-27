import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { ImageSource } from "expo-image";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { resolveItemImageUrl } from "@/utils/jellyfin/image/getItemImageUrl";
import type { ImageKind } from "@/utils/jellyfin/image/resolveItemImage";

interface Props {
  item: BaseItemDto;
  api: Api;
  /** @deprecated Quality follows the image type; this is ignored. */
  quality?: number;
  /** Image width in physical pixels, not layout points. */
  width?: number;
  /**
   * Height of the box the image has to cover, in physical pixels. With it the
   * request becomes "cover a `width` by `height` box" instead of a fixed width.
   */
  height?: number;
  kind?: ImageKind;
}

export const getItemImage = ({
  item,
  api,
  kind = "primary",
  width = 1000,
  height,
}: Props) => {
  if (!api) return null;

  const resolved = resolveItemImageUrl(api, item, kind, {
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
