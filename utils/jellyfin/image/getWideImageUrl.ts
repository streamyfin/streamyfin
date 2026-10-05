import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Landscape (16:9-ish) image for an item, as used by the continue-watching
 * cards: the Thumb when the item has one, with a failover to Primary.
 *
 * @param useEpisodePoster - Prefer the episode's own still over the series
 *   Thumb for episodes (the `useEpisodeImagesForNextUp` setting).
 * @param fillHeight - The image height in physical pixels, not layout points:
 *   convert with `toImagePixels`.
 * @param fillWidth - The width of the box the image has to cover, in physical
 *   pixels. Pass it whenever the image is drawn cover fit: the Primary
 *   failover can be a 2:3 poster, which the height alone leaves far too narrow.
 */
export const getWideImageUrl = ({
  api,
  item,
  useEpisodePoster = false,
  fillHeight,
  fillWidth,
  quality = 80,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  useEpisodePoster?: boolean;
  fillHeight: number;
  fillWidth?: number;
  quality?: number;
}): string | undefined => {
  if (!api || !item?.Id) return undefined;

  // With both sides the server returns the smallest image that fills the box,
  // whichever side binds. A Thumb is as wide as the card, so its height is
  // enough; a Primary image is whatever shape the item's artwork has.
  const primaryBox = fillWidth
    ? `fillWidth=${fillWidth}&fillHeight=${fillHeight}`
    : `fillHeight=${fillHeight}`;
  const primary = `${api.basePath}/Items/${item.Id}/Images/Primary?${primaryBox}&quality=${quality}`;
  const thumb = (itemId: string, tag: string) =>
    `${api.basePath}/Items/${itemId}/Images/Thumb?fillHeight=${fillHeight}&quality=${quality}&tag=${tag}`;

  if (item.Type === "Episode") {
    if (useEpisodePoster) return primary;

    // Matched pair: the parent that owns the Thumb (ParentThumbItemId), not the
    // backdrop owner — otherwise the Thumb tag is requested on the wrong item → black.
    if (item.ParentThumbItemId && item.ParentThumbImageTag) {
      return thumb(item.ParentThumbItemId, item.ParentThumbImageTag);
    }

    return primary;
  }

  if (item.ImageTags?.Thumb) {
    return thumb(item.Id, item.ImageTags.Thumb);
  }

  return primary;
};
