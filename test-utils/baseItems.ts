import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/** `count` items named `${prefix} ${index}`, each with primary artwork. */
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
    RunTimeTicks: type === "Audio" ? 300 * 10_000_000 : undefined,
    Artists: type === "Audio" ? [`${prefix} Artist`] : undefined,
    Album: type === "Audio" ? `${prefix} Album` : undefined,
  }));
