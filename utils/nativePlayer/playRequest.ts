/**
 * A normalized "play this item" request: what every call site hands
 * `usePlayMedia`, and what a remote Play command or a SyncPlay queue item is
 * turned into.
 *
 * A missing `playbackPositionTicks` means "resume at the item's stored
 * position" and a 0 "start at the beginning" (buildNativePlayerConfig).
 * Writing 0 for a request that has none (a top shelf play link, a remote Play
 * command) starts a half watched item from the top, and the stop report that
 * follows clears its resume point on the server.
 */
export interface PlayRequest {
  itemId: string;
  audioIndex?: number;
  subtitleIndex?: number;
  /**
   * A subtitle saved on this device picked on the item page: its file, the
   * one the page showed. Its sidecar index alone points at a position, which
   * shifts when a saved file goes away.
   */
  subtitlePath?: string;
  mediaSourceId?: string;
  bitrateValue?: number;
  offline: boolean;
  playbackPositionTicks?: number;
}
