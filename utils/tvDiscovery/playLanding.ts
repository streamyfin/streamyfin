import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { TOP_SHELF_PLAY_LOOKUP_TIMEOUT } from "@/constants/TVDiscovery";
import { isPlayableItem } from "@/utils/jellyfin/media/isPlayableItem";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { getTopShelfItemPath } from "./itemPath";

/**
 * Where a `streamyfin://topshelf/play` link goes instead of the player, or
 * null when the item is one the player can be given.
 *
 * `payload.ts` no longer writes a play link for a container, but a tile keeps
 * the link it was published with until Home runs again, and anyone can write
 * one by hand. The page is the same one the tile's own `route` opens.
 */
export function getTopShelfPlayLanding(
  item:
    | Pick<
        BaseItemDto,
        "Id" | "Type" | "MediaType" | "SeriesId" | "IndexNumber"
      >
    | null
    | undefined,
): string | null {
  if (!item?.Id || isPlayableItem(item)) return null;

  return getTopShelfItemPath({
    id: item.Id,
    type: item.Type ?? undefined,
    seriesId: item.SeriesId ?? undefined,
    seasonIndex: item.IndexNumber?.toString(),
  });
}

/**
 * The item behind a play link, or null when the server did not say in time.
 * Never rejects and never waits longer than `timeoutMs`: no answer means the
 * link is played as it is, which is what happened before the lookup existed.
 */
export async function lookUpTopShelfPlayItem({
  api,
  userId,
  itemId,
  timeoutMs = TOP_SHELF_PLAY_LOOKUP_TIMEOUT,
}: {
  api: Api | null | undefined;
  userId: string | null | undefined;
  itemId: string;
  timeoutMs?: number;
}): Promise<BaseItemDto | null> {
  if (!api || !userId) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const gaveUp = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([
      getUserItemData({ api, userId, itemId }).catch(() => null),
      gaveUp,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
