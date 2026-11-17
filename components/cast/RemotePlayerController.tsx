import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { setRemoteServer, useCastDevice } from "@/modules/mpv-player/src/cast";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { receiverNameFor } from "@/utils/cast/jellyfinReceiver";
import { remotePlayerRouted } from "@/utils/cast/remotePlayerGate";

/**
 * Gives native the current account's server, which the remote engine plays from and names in every
 * message, and takes it back at sign out: without a server the engine goes, sending nothing to the TV.
 * Only behind the development gate for now. Mounted once, at the root, off TV; renders nothing.
 */
export function RemotePlayerController() {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  // The receiver names its Jellyfin device from each message: the connected TV's name goes with the server.
  const receiverName = receiverNameFor(useCastDevice());
  const routed = remotePlayerRouted();
  const serverAddress = api?.basePath;
  const accessToken = api?.accessToken;
  const userId = user?.Id;

  useEffect(() => {
    if (!routed) return;
    if (!serverAddress || !accessToken || !userId) {
      void setRemoteServer(null);
      return;
    }
    void setRemoteServer({
      serverAddress,
      accessToken,
      userId,
      ...(receiverName ? { receiverName } : {}),
    });
  }, [routed, serverAddress, accessToken, userId, receiverName]);

  return null;
}
