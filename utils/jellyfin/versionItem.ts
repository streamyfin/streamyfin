import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { isAlternateVersion } from "./mediaSourceVersion";
import { supportsPerVersionUserData } from "./serverVersion";

/**
 * The item to fetch for the selected version's UserData, or undefined when
 * the item's own UserData already applies: the primary version, a source
 * that is not a version, offline, or a server older than Jellyfin 12.
 */
export const getVersionItemId = (
  item: BaseItemDto | null | undefined,
  mediaSources: MediaSourceInfo[] | null | undefined,
  mediaSourceId: string | null | undefined,
  serverVersion: string | null | undefined,
  offline: boolean,
): string | undefined => {
  if (offline || !isAlternateVersion(item?.Id, mediaSources, mediaSourceId)) {
    return undefined;
  }
  return supportsPerVersionUserData(serverVersion)
    ? (mediaSourceId ?? undefined)
    : undefined;
};
