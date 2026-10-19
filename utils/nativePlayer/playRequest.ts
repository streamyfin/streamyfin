/**
 * A normalized "play this item" request for the upcoming native iOS player.
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
}

/**
 * Serialize a PlayRequest into the query string /player/direct-player reads:
 * missing optionals become empty strings and offline is "true"/"false".
 *
 * That includes the position. The route reads an empty one as "resume at the
 * item's stored position" and a 0 as "start at the beginning", which is what
 * buildNativePlayerConfig does with a missing playbackPositionTicks for the
 * native player. Writing 0 for a request that has none (a top shelf play
 * link, a remote Play command) started a half watched item from the top, and
 * the stop report that followed cleared its resume point on the server.
 */
export const toDirectPlayerQuery = (req: PlayRequest): string => {
  const queryParams = new URLSearchParams({
    itemId: req.itemId,
    audioIndex: req.audioIndex?.toString() ?? "",
    subtitleIndex: req.subtitleIndex?.toString() ?? "",
    mediaSourceId: req.mediaSourceId ?? "",
    bitrateValue: req.bitrateValue?.toString() ?? "",
    playbackPosition: req.playbackPositionTicks?.toString() ?? "",
    offline: req.offline ? "true" : "false",
  });
  return queryParams.toString();
};
