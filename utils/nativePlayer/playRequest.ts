/**
 * A normalized "play this item" request shared by native and React players.
 * Mirrors the query parameters the direct player screen already accepts so
 * both players can be driven from the same call sites.
 */
export interface PlayRequest {
  itemId: string;
  audioIndex?: number;
  subtitleIndex?: number;
  mediaSourceId?: string;
  bitrateValue?: number;
  offline: boolean;
  playbackPositionTicks?: number;
  /** Server-driven group playback: load paused until SyncPlay releases it. */
  syncPlay?: boolean;
}

/** Local track/source choices never become part of the group-wide queue DTO. */
export function mergeLocalPlaybackRequest(
  request: PlayRequest,
  local: PlayRequest | null,
): PlayRequest {
  if (local?.itemId !== request.itemId) return request;
  return {
    ...request,
    audioIndex: local.audioIndex,
    subtitleIndex: local.subtitleIndex,
    mediaSourceId: local.mediaSourceId,
    bitrateValue: local.bitrateValue,
  };
}

/**
 * Serialize a PlayRequest into the exact query string PlayButton's
 * handleNormalPlayFlow builds for /player/direct-player today: missing
 * optionals become empty strings, playbackPosition defaults to "0" and
 * offline is "true"/"false".
 */
export const toDirectPlayerQuery = (req: PlayRequest): string => {
  const queryParams = new URLSearchParams({
    itemId: req.itemId,
    audioIndex: req.audioIndex?.toString() ?? "",
    subtitleIndex: req.subtitleIndex?.toString() ?? "",
    mediaSourceId: req.mediaSourceId ?? "",
    bitrateValue: req.bitrateValue?.toString() ?? "",
    playbackPosition: req.playbackPositionTicks?.toString() ?? "0",
    offline: req.offline ? "true" : "false",
  });
  if (req.syncPlay) queryParams.set("syncPlay", "true");
  return queryParams.toString();
};
