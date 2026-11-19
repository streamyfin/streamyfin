import type { RemotePlaybackState } from "@/modules/mpv-player/src/cast/Cast.types";

/**
 * What the TV plays against the screen: `same` while it holds the item shown (or none yet), `sent` once it went on to
 * another item of the list the phone sent, `other` for an item the phone did not send.
 */
export const followRemoteItem = (
  previousItemId: string | null,
  state: RemotePlaybackState,
  sentIds: readonly string[],
): "same" | "sent" | "other" => {
  if (state.itemId === null || state.itemId === previousItemId) return "same";
  return sentIds.includes(state.itemId) ? "sent" : "other";
};
