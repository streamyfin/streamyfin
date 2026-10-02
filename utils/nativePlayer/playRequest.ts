import { toServerSubtitleIndex } from "@/utils/subtitles/subtitleIndex";

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

/** Track picks and the media version whose index space they belong to. */
export type StreamTrackRequest = Pick<
  PlayRequest,
  "audioIndex" | "subtitleIndex" | "mediaSourceId"
>;

/** Menu values distinguish a deliberate pick from a possibly stale automatic default. */
export interface TrackMenuSelection {
  /** Displayed soundtrack index. */
  audioIndex?: number;
  /** Displayed subtitle index, including off. */
  subtitleIndex?: number;
  /** The user explicitly selected this soundtrack for this play request. */
  audioSelectionExplicit?: boolean;
  /** The user explicitly selected this subtitle for this play request. */
  subtitleSelectionExplicit?: boolean;
}

/** Only deliberate menu picks may override fresh server or download defaults. */
export function getExplicitTrackIndexes(selection: TrackMenuSelection) {
  return {
    audioIndex: selection.audioSelectionExplicit
      ? selection.audioIndex
      : undefined,
    subtitleIndex: selection.subtitleSelectionExplicit
      ? selection.subtitleIndex
      : undefined,
  };
}

/** Metadata refetches use live picks, not stale route defaults; local subtitles stay server-off. */
export function getStreamRequestIndexes(
  route: StreamTrackRequest,
  live?: StreamTrackRequest,
): StreamTrackRequest {
  const selection = live ?? route;
  const mediaSourceId = live?.mediaSourceId || route.mediaSourceId;
  return {
    ...(mediaSourceId && { mediaSourceId }),
    audioIndex: selection.audioIndex,
    subtitleIndex:
      selection.subtitleIndex === undefined
        ? undefined
        : toServerSubtitleIndex(selection.subtitleIndex),
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
  return queryParams.toString();
};
