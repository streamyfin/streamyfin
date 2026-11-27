import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemImageUrl } from "./getItemImageUrl";

/**
 * Portrait (10:15) poster image for an item, as used by the poster cards.
 *
 * An episode has no poster of its own, so it borrows its series' primary
 * image — that is what a vertical row of episodes is expected to show.
 *
 * @param width - The image width in physical pixels, not layout points:
 *   convert with `toImagePixels`.
 */
export const getPortraitImageUrl = ({
  api,
  item,
  width,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  width: number;
}): string | undefined =>
  getItemImageUrl(api, item, "poster", { width: width || 500 }) ?? undefined;
