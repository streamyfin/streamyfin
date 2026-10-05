import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Whether `mediaSourceId` is an alternate version grouped under the item.
 * Grouped versions always list the primary, whose source ID is the item ID;
 * plugin, channel and Live TV streams have source IDs that name no item.
 */
export const isAlternateVersion = (
  itemId: string | null | undefined,
  mediaSources: MediaSourceInfo[] | null | undefined,
  mediaSourceId: string | null | undefined,
): boolean =>
  !!itemId &&
  !!mediaSourceId &&
  mediaSourceId !== itemId &&
  (mediaSources?.length ?? 0) > 1 &&
  !!mediaSources?.some((s) => s.Id === itemId);

/**
 * Runtime of what is playing. The item's RunTimeTicks is its primary
 * version's, and an alternate cut can run longer or shorter.
 */
export const getPlayingRunTimeTicks = (
  item: Pick<BaseItemDto, "RunTimeTicks">,
  mediaSource: Pick<MediaSourceInfo, "RunTimeTicks"> | null | undefined,
): number => mediaSource?.RunTimeTicks || item.RunTimeTicks || 0;
