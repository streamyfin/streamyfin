import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { Settings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";

/** The track indexes a download record pinned when the file was pulled down. */
export interface DownloadedTrackIndexes {
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
}

/**
 * Decide which audio/subtitle streams a playback session starts on.
 *
 * Precedence, highest first:
 *  1. What the caller explicitly asked for. The item pages resolve tracks
 *     themselves and an explicit pick must never be second-guessed.
 *  2. Offline only: the download record. A download's track set is whatever was
 *     pulled down, and only the record knows it — resolving against the server
 *     media source would hand back an index for a stream the local file does
 *     not contain (a transcoded download keeps one audio track and burns image
 *     subs in), so the session would start on a track that cannot play.
 *  3. A fresh resolution — series memory, then language preferences, then the
 *     server defaults — for callers that cannot resolve: top shelf, WebSocket
 *     Play commands, any bare playMedia({ itemId }).
 *  4. Subtitles off.
 */
export function resolveTrackIndexes(params: {
  item: BaseItemDto;
  settings: Settings;
  offline: boolean;
  /** Present for offline sessions; the pinned indexes of the local file. */
  downloaded?: DownloadedTrackIndexes | null;
  requested: {
    audioIndex?: number;
    subtitleIndex?: number;
    mediaSourceId?: string;
  };
}): { audioIndex: number | undefined; subtitleIndex: number } {
  const { item, settings, offline, downloaded, requested } = params;

  // getDefaultPlaySettings always reads MediaSources[0], so when the caller
  // named a different version resolve against that one — stream indexes are
  // per-source and version 1's numbering does not apply to version 2.
  const requestedSource = requested.mediaSourceId
    ? item.MediaSources?.find((s) => s.Id === requested.mediaSourceId)
    : undefined;

  // Never offline: see (2) above. The download record is the authority there,
  // and a resolution against the server source would contradict it.
  const needsResolve =
    !offline &&
    (requested.audioIndex === undefined ||
      requested.subtitleIndex === undefined);

  const resolved = needsResolve
    ? getDefaultPlaySettings(
        requestedSource ? { ...item, MediaSources: [requestedSource] } : item,
        settings,
      )
    : null;

  return {
    audioIndex:
      requested.audioIndex ??
      (offline ? downloaded?.audioStreamIndex : undefined) ??
      resolved?.audioIndex,
    subtitleIndex:
      requested.subtitleIndex ??
      (offline ? downloaded?.subtitleStreamIndex : undefined) ??
      resolved?.subtitleIndex ??
      SUBTITLES_OFF,
  };
}
