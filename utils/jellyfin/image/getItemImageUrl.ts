import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemPerson,
  ImageType,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  BACKDROP_IMAGE_QUALITY,
  IMAGE_QUALITY,
  MAX_LOGO_HEIGHT_PX,
} from "@/constants/Images";
import { fillHeightImageParams } from "./imagePixels";
import { itemImageUrl } from "./itemImageUrl";
import {
  type ImageKind,
  type ImageRef,
  resolveItemImage,
} from "./resolveItemImage";

type ImageSize = {
  /** Physical pixels, not layout points: convert with `toImagePixels`. */
  width?: number;
  /** Physical pixels. With a width, the box the image has to cover. */
  height?: number;
};

export type ItemImageOptions = ImageSize & {
  /** `wide` only: prefer an episode's own still over its series' Thumb. */
  preferEpisodeImage?: boolean;
};

const sizeParams = (
  { width, height }: ImageSize,
  maxHeight?: number,
): Record<string, number> => {
  const h =
    height === undefined
      ? undefined
      : Math.min(Math.round(height), maxHeight ?? Number.POSITIVE_INFINITY);
  if (width !== undefined && h !== undefined) {
    return { fillWidth: Math.round(width), ...fillHeightImageParams(h) };
  }
  if (width !== undefined) return { fillWidth: Math.round(width) };
  if (h !== undefined) return { fillHeight: h };
  return {};
};

const isBackdrop = (type: ImageType) => type === "Backdrop";

const qualityOf = (type: ImageType) =>
  isBackdrop(type) ? BACKDROP_IMAGE_QUALITY : IMAGE_QUALITY;

/**
 * The URL of an item's image of a kind, and the image it came from, which
 * carries the blurhash. Null when the item has no such image.
 */
export const resolveItemImageUrl = (
  api: Api | null | undefined,
  item: BaseItemDto | BaseItemPerson | null | undefined,
  kind: ImageKind,
  options: ItemImageOptions = {},
): { url: string; ref: ImageRef } | null => {
  if (!api) return null;
  const ref = resolveItemImage(item, kind, options);
  if (!ref) return null;

  const isLogo = kind === "logo";
  const url = itemImageUrl(api, ref.itemId, ref.type, {
    ...sizeParams(options, isLogo ? MAX_LOGO_HEIGHT_PX : undefined),
    quality: qualityOf(ref.type),
    tag: ref.tag,
    ...(isBackdrop(ref.type) ? { imageIndex: 0 } : null),
  });
  return { url, ref };
};

/**
 * The one entry point for an item's image URL. Never returns an untagged URL:
 * an item without the image gets null, and a placeholder beats a 404.
 */
export const getItemImageUrl = (
  api: Api | null | undefined,
  item: BaseItemDto | BaseItemPerson | null | undefined,
  kind: ImageKind,
  options: ItemImageOptions = {},
): string | null => resolveItemImageUrl(api, item, kind, options)?.url ?? null;

/**
 * An image of an item known only by its id. Untagged by necessity, so the
 * server cannot tell a changed image from the cached one: use it only where
 * the caller has no item.
 */
export const getItemImageUrlById = (
  api: Api | null | undefined,
  itemId: string | null | undefined,
  type: ImageType,
  options: ImageSize = {},
): string | null => {
  if (!api || !itemId) return null;
  return itemImageUrl(api, itemId, type, {
    ...sizeParams(options),
    quality: qualityOf(type),
    ...(isBackdrop(type) ? { imageIndex: 0 } : null),
  });
};
