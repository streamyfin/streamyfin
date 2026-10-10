import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * A Live TV program the listings mark as broadcast live, a match as it is
 * played rather than a rerun of it. Not the same as "on air now": every
 * program is that at some point. Jellyfin 12 fills this in from XMLTV too
 * (jellyfin/jellyfin#8890); before that only some listings providers did.
 */
export const isLiveBroadcast = (item: BaseItemDto): boolean =>
  item.Type === "Program" && item.IsLive === true;
