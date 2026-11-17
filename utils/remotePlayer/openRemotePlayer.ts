import {
  type RemoteTarget,
  remotePlayback,
} from "@/modules/mpv-player/src/cast";
import type { RemotePlaybackState } from "@/modules/mpv-player/src/cast/Cast.types";
import { remotePlayAtom } from "@/utils/atoms/remotePlayer";
import {
  type RemotePlayDeps,
  showForeignOnRemote,
  showRemoteItem,
} from "./playOnRemote";
import { type RemoteItem, resolveRemoteItem } from "./resolveRemoteItem";

/**
 * `moved`: the TV went on to another item while the server answered. `sending`: a send of this phone owns the
 * screen; it presents its own once the TV takes it, and showing anything over it would supersede it.
 */
export type ShownRemoteItem = RemoteItem["kind"] | "moved" | "sending";

const sending = (deps: RemotePlayDeps) =>
  deps.store.get(remotePlayAtom)?.loaded === false;

/**
 * Shows what the TV plays at `state`, whoever sent it: the full player for an item this account's server returns,
 * the reduced one for media it does not know, `onMusic` for audio, nothing when nothing is loaded. Refused natively,
 * the error is the caller's.
 */
export const showWhatTheTvPlays = async (
  deps: RemotePlayDeps & { onMusic: () => void | Promise<void> },
  remote: RemoteTarget,
  state: RemotePlaybackState,
): Promise<ShownRemoteItem> => {
  const resolved = await resolveRemoteItem(deps, state);
  if (remotePlayback().itemId !== state.itemId) return "moved";
  if (sending(deps)) return "sending";
  switch (resolved.kind) {
    case "known":
      // Read again: the TV's list and tracks may have moved while the server answered.
      await showRemoteItem(deps, resolved.item, remote, remotePlayback());
      break;
    case "foreign":
      await showForeignOnRemote(
        deps,
        {
          itemId: resolved.itemId,
          title: resolved.title,
          imageUrl: resolved.imageUrl,
        },
        remote,
      );
      break;
    case "music":
      await deps.onMusic();
      break;
  }
  return resolved.kind;
};

/** Remote in the output sheet: the screen on what the TV plays, the app's music player for audio. */
export const openRemotePlayer = async (
  deps: RemotePlayDeps & { openMusicPlayer: () => void },
  remote: RemoteTarget,
): Promise<ShownRemoteItem> => {
  if (sending(deps)) return "sending";
  const show = { ...deps, onMusic: deps.openMusicPlayer };
  const shown = await showWhatTheTvPlays(show, remote, remotePlayback());
  // Asked once more on where the TV is now, the press shows that rather than nothing.
  return shown === "moved"
    ? showWhatTheTvPlays(show, remote, remotePlayback())
    : shown;
};
