import { MAX_BITRATE_VALUE } from "@/constants/Bitrate";

/**
 * The player route for a channel, or a program of the guide. Live TV plays
 * without a cap whatever the default quality, so the route says Max: one that
 * names no quality plays at the default.
 */
export const liveTvPlayerPath = (
  itemId: string,
): `/player/direct-player?${string}` =>
  `/player/direct-player?${new URLSearchParams({
    itemId,
    audioIndex: "",
    subtitleIndex: "",
    mediaSourceId: "",
    bitrateValue: MAX_BITRATE_VALUE,
  }).toString()}`;
