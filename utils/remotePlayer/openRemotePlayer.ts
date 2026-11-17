import {
  type RemoteTarget,
  remotePlayback,
} from "@/modules/mpv-player/src/cast";
import {
  type RemotePlayDeps,
  showForeignOnRemote,
  showRemoteItem,
} from "./playOnRemote";
import { type RemoteItem, resolveRemoteItem } from "./resolveRemoteItem";

/**
 * Opens the screen on what the TV plays, whoever sent it: the full player for an item this account's server returns,
 * the reduced one for media it does not know, the app's music player for audio, nothing when nothing is loaded.
 * Refused natively, the error is the caller's.
 */
export const openRemotePlayer = async (
  deps: RemotePlayDeps & { openMusicPlayer: () => void },
  remote: RemoteTarget,
): Promise<RemoteItem["kind"]> => {
  const resolved = await resolveRemoteItem(deps, remotePlayback());
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
      deps.openMusicPlayer();
      break;
  }
  return resolved.kind;
};
