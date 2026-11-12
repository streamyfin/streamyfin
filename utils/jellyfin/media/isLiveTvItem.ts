import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * An item that plays as Live TV: a channel, or a program, which plays the
 * channel it airs on as it is on air now. Its stream has no start, no end and
 * no resume point. Not `isLiveBroadcast`, which tells a match aired live from
 * a rerun of it.
 */
export const isLiveTvItem = (item: BaseItemDto | null | undefined): boolean =>
  item?.Type === "Program" || item?.Type === "TvChannel";
