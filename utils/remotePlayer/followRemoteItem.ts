import type { RemotePlaybackState } from "@/modules/mpv-player/src/cast/Cast.types";

/**
 * What the TV plays against the screen: `same` while it holds the item shown (or none yet), `sent` once it went on to
 * another item of the list the phone sent, `other` for an item the phone did not send or media without an item id.
 */
export const followRemoteItem = (
  previousItemId: string | null,
  state: RemotePlaybackState,
  sentIds: readonly string[],
): "same" | "sent" | "other" => {
  if (state.itemId === null) return state.foreign ? "other" : "same";
  if (state.itemId === previousItemId) return "same";
  return sentIds.includes(state.itemId) ? "sent" : "other";
};

/**
 * What the TV plays against the foreign media the reduced player shows: `same` while it holds that media (as the Cast
 * status names it) or nothing yet, `other` once it plays anything else.
 */
export const followForeignMedia = (
  shown: {
    itemId: string | null;
    title: string | null;
    imageUrl: string | null;
  },
  state: RemotePlaybackState,
): "same" | "other" => {
  if (state.itemId === null && !state.foreign) return "same";
  return state.itemId === shown.itemId &&
    state.title === shown.title &&
    state.imageUrl === shown.imageUrl
    ? "same"
    : "other";
};
