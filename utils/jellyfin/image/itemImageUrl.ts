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
const CANONICAL_PARAM_SET = new Set(CANONICAL_PARAM_ORDER);

// axios encodes a query value this way (helpers/buildURL.js). The replaces
// only rewrite escapes, so a value that needs none skips them: sizes, quality
// and tags never do.
const encode = (value: string) => {
  const encoded = encodeURIComponent(value);
  if (!encoded.includes("%")) return encoded;
  return encoded
    .replace(/%3A/gi, ":")
    .replace(/%24/g, "$")
    .replace(/%2C/gi, ",")
    .replace(/%20/g, "+");
};

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
  // One pass per list, no intermediate arrays: a library grid builds this for
  // every card on every page it loads.
  const pairs: string[] = [];
  const add = (key: string) => {
    const value = params[key];
    if (value === undefined || value === null) return;
    pairs.push(`${encode(key)}=${encode(String(value))}`);
  };
  for (const key of CANONICAL_PARAM_ORDER) {
    if (key in params) add(key);
  }
  for (const key in params) {
    if (!CANONICAL_PARAM_SET.has(key)) add(key);
  }
  const query = pairs.join("&");
  const base = api.basePath.replace(/\/+$/, "");
  const path = `${base}/Items/${itemId}/Images/${imageType}`;
  return query ? `${path}?${query}` : path;
};
