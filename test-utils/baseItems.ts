import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * `count` items named `${prefix} ${index}`, each with primary artwork. Shaped
 * like the server's: an item always carries `BackdropImageTags`, empty when it
 * has none, and image code branches on its presence.
 */
export const makeItems = (
  count: number,
  prefix = "Movie",
  type: "Movie" | "Episode" | "Audio" = "Movie",
): BaseItemDto[] =>
  Array.from({ length: count }, (_, index) => ({
    Id: `${prefix}-${index}`,
    Name: `${prefix} ${index}`,
    Type: type,
    SeriesName: type === "Episode" ? `${prefix} series ${index}` : undefined,
    ImageTags: { Primary: `tag-${prefix}-${index}` },
    BackdropImageTags: [],
    RunTimeTicks: type === "Audio" ? 300 * 10_000_000 : undefined,
    Artists: type === "Audio" ? [`${prefix} Artist`] : undefined,
    Album: type === "Audio" ? `${prefix} Album` : undefined,
  }));
