import { MAX_BITRATE_VALUE } from "@/constants/Bitrate";
import { toDirectPlayerQuery } from "@/utils/nativePlayer/playRequest";

/**
 * The player route for a channel, or a program of the guide. Live TV plays
 * without a cap whatever the default quality, so the route says Max: one that
 * names no quality would get the same from the player, but the quality menus
 * read the route.
 */
export const liveTvPlayerPath = (
  itemId: string,
): `/player/direct-player?${string}` =>
  `/player/direct-player?${toDirectPlayerQuery({
    itemId,
    bitrateValue: MAX_BITRATE_VALUE,
    offline: false,
  })}`;
