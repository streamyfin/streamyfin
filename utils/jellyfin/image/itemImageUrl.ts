import type { Api } from "@jellyfin/sdk";
import type { ImageType } from "@jellyfin/sdk/lib/generated-client/models";

type ImageUrlParams = Record<
  string,
  string | number | boolean | null | undefined
>;

// The query order is part of the image cache key. A fixed order gives one key
// per image, whatever order the caller's object lists its params in.
const CANONICAL_PARAM_ORDER = [
  "fillWidth",
  "fillHeight",
  "maxWidth",
  "maxHeight",
  "width",
  "height",
  "quality",
  "tag",
  "imageIndex",
];

// axios encodes a query value this way (helpers/buildURL.js).
const encode = (value: string) =>
  encodeURIComponent(value)
    .replace(/%3A/gi, ":")
    .replace(/%24/g, "$")
    .replace(/%2C/gi, ",")
    .replace(/%20/g, "+");

/**
 * An item's image URL, the one `getImageApi(api).getItemImageUrlById` returns
 * for the same arguments, built without its cost. The SDK creates an API
 * client and runs `axios.getUri` for each URL, which merges the whole axios
 * configuration on every call, and a library grid builds thousands of them.
 * Spec: itemImageUrl.test.ts holds the two to the same output.
 */
export const itemImageUrl = (
  api: Api,
  itemId: string,
  imageType: ImageType | `${ImageType}`,
  params: ImageUrlParams = {},
): string => {
  const known = CANONICAL_PARAM_ORDER.filter((key) => key in params).map(
    (key) => [key, params[key]] as const,
  );
  const others = Object.entries(params).filter(
    ([key]) => !CANONICAL_PARAM_ORDER.includes(key),
  );
  const query = [...known, ...others]
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encode(key)}=${encode(String(value))}`)
    .join("&");
  const base = api.basePath.replace(/\/+$/, "");
  const path = `${base}/Items/${itemId}/Images/${imageType}`;
  return query ? `${path}?${query}` : path;
};
