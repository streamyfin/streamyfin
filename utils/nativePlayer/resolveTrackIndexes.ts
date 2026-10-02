import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import type { Settings } from "@/utils/atoms/settings";
import {
  type DownloadedTrackIndexes,
  getDefaultPlaySettings,
  getRememberedTrackIndexes,
} from "@/utils/jellyfin/getDefaultPlaySettings";

export type { DownloadedTrackIndexes } from "@/utils/jellyfin/getDefaultPlaySettings";

/**
 * Explicit picks win. Downloads use eligible local identities, then their pinned
 * indexes. Online defaults are left unset for fresh Jellyfin negotiation, except
 * equivalent-track preferences when starting a new episode.
 */
export function resolveTrackIndexes(params: {
  /** Item being started. */
  item: BaseItemDto;
  /** Remember-selection switches. */
  settings: Settings;
  /** Whether the source is a downloaded file. */
  offline: boolean;
  /** Track choices pinned at download time. */
  downloaded?: DownloadedTrackIndexes | null;
  /** Actual downloaded source, not server metadata. */
  downloadedMediaSource?: MediaSourceInfo;
  /** Authenticated server/user cache namespace. */
  memoryScope?: string;
  /** Deliberate selections supplied by the caller. */
  requested: {
    /** Explicit soundtrack index. */
    audioIndex?: number;
    /** Explicit subtitle index; -1 is off. */
    subtitleIndex?: number;
    /** Selected video version. */
    mediaSourceId?: string;
  };
}): { audioIndex: number | undefined; subtitleIndex: number | undefined } {
  const { item, settings, offline, downloaded, requested } = params;
  const requestedSource = item.MediaSources?.find(
    (source) => source.Id === requested.mediaSourceId,
  );
  const selectedItem = requestedSource
    ? { ...item, MediaSources: [requestedSource] }
    : item;
  const options = {
    offline,
    downloaded,
    downloadedMediaSource: params.downloadedMediaSource,
    memoryScope: params.memoryScope,
  };
  const defaults = offline
    ? getDefaultPlaySettings(selectedItem, settings, options)
    : getRememberedTrackIndexes(selectedItem, settings, options);
  return {
    audioIndex: requested.audioIndex ?? defaults.audioIndex,
    subtitleIndex: requested.subtitleIndex ?? defaults.subtitleIndex,
  };
}
