import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemPerson,
  ImageType,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  BACKDROP_IMAGE_QUALITY,
  IMAGE_QUALITY,
  IMAGE_SIZE_STEP_PX,
  MAX_LOGO_HEIGHT_PX,
} from "@/constants/Images";
import { fillHeightImageParams, toImagePixels } from "./imagePixels";
import { itemImageUrl } from "./itemImageUrl";
import {
  type ImageKind,
  type ImageRef,
  resolveItemImage,
} from "./resolveItemImage";

type ImageSize = {
  /**
   * Width of the box the image is drawn in, in layout points. The request is
   * that many physical pixels on this screen, rounded up to the next
   * `IMAGE_SIZE_STEP_PX`. With `pixels`, it is physical pixels already.
   */
  width?: number;
  /**
   * Height of the box the image is drawn in, in layout points, converted and
   * rounded like `width`. With a width, the box the image has to cover.
   */
  height?: number;
  /**
   * `width` and `height` are physical pixels, not layout points. For an image
   * the app does not draw itself (lock screen artwork, a Top Shelf payload, a
   * download), which has no layout box to convert, or for many images of one
   * size the caller converted once (a card grid). Still rounded up to the
   * next `IMAGE_SIZE_STEP_PX`.
   */
  pixels?: boolean;
};

export type ItemImageOptions = ImageSize & {
  /** `wide` only: prefer an episode's own still over its series' Thumb. */
  preferEpisodeImage?: boolean;
};

/**
 * The size to request for one side: the drawn size in physical pixels,
 * rounded up to the next step so near-identical boxes share one cached image
 * (jellyfin-apiclient `normalizeImageOptions` converts the drawn size with the
 * device pixel ratio the same way).
 */
const requestPixels = (size: number, pixels: boolean | undefined) =>
  Math.ceil(
    Math.round(pixels ? size : toImagePixels(size)) / IMAGE_SIZE_STEP_PX,
  ) * IMAGE_SIZE_STEP_PX;

const sizeParams = (
  { width, height, pixels }: ImageSize,
  maxHeight?: number,
): Record<string, number> => {
  const w = width === undefined ? undefined : requestPixels(width, pixels);
  const h =
    height === undefined
      ? undefined
      : Math.min(
          requestPixels(height, pixels),
          maxHeight ?? Number.POSITIVE_INFINITY,
        );
  if (w !== undefined && h !== undefined) {
    return { fillWidth: w, ...fillHeightImageParams(h) };
  }
  if (w !== undefined) return { fillWidth: w };
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
