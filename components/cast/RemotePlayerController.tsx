import { useAtomValue, useStore } from "jotai";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import {
  setRemoteServer,
  useRemoteTarget,
} from "@/modules/mpv-player/src/cast";
import { dismissNativePlayer } from "@/modules/mpv-player/src/NativePlayerPresentation";
import {
  addRemotePlayerListener,
  showRemotePlayerFailure,
} from "@/modules/mpv-player/src/RemotePlayerPresentation";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { remotePlayAtom } from "@/utils/atoms/remotePlayer";
import { receiverNameFor } from "@/utils/cast/jellyfinReceiver";
import { remoteErrorMessage } from "@/utils/cast/receiverLoadErrorMessage";
import { remotePlayerRouted } from "@/utils/cast/remotePlayerGate";
import { logAndCaptureError } from "@/utils/log";
import { secondsToTicks } from "@/utils/time";
import { stopAndPlayHere } from "./OutputPickerActions";

/**
 * Gives native the current account's server, which the remote engine plays from and names in every
 * message, and takes it back at sign out: without a server the engine goes, sending nothing to the TV.
 * While a remote player is up it answers its events: Play here goes on on the phone, an error of the
 * receiver after the load is said on the screen, and closing it only forgets the play, sending nothing.
 * Only behind the development gate for now. Mounted once, at the root, off TV; renders nothing.
 */
export function RemotePlayerController() {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  // The receiver names its Jellyfin device from each message: the TV's name goes with the server. It comes from
  // the hub's target, which a suspended session keeps; the JS session goes null there, and a server without the
  // name would make native drop the engine an open remote screen holds.
  const { target } = useRemoteTarget();
  const receiverName = receiverNameFor(
    target?.kind === "cast" ? { friendlyName: target.name } : null,
  );
  const routed = remotePlayerRouted();
  const serverAddress = api?.basePath;
  const accessToken = api?.accessToken;
  const userId = user?.Id;
  const { t } = useTranslation();
  const store = useStore();
  const playMedia = usePlayMedia();
  const syncPlay = useSyncPlay();
  // Read when the screen asks: set at the commit, so an event arriving before the passive effects reads it.
  const latest = useRef({ playMedia, inGroup: syncPlay.enabled, t });
  useLayoutEffect(() => {
    latest.current = { playMedia, inGroup: syncPlay.enabled, t };
  }, [playMedia, syncPlay.enabled, t]);

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

  useEffect(() => {
    if (!routed) return;
    const playHere = async (positionSec: number) => {
      const held = store.get(remotePlayAtom);
      if (!held) return;
      store.set(remotePlayAtom, null);
      // One player presented at a time: the remote screen goes before the local one opens.
      await dismissNativePlayer();
      const { play } = held;
      const user = store.get(userAtom);
      await stopAndPlayHere(
        { store, playMedia: (...args) => latest.current.playMedia(...args) },
        {
          itemId: play.item.Id ?? "",
          mediaSourceId: play.mediaSourceId,
          audioIndex: play.audioIndex,
          subtitleIndex: play.subtitleIndex,
          // A send the TV never started has no TV position: the phone starts where the send asked.
          playbackPositionTicks: held.loaded
            ? secondsToTicks(positionSec)
            : play.positionTicks,
        },
        play.item,
        () => latest.current.inGroup || store.get(userAtom)?.Id !== user?.Id,
      );
    };
    const subscriptions = [
      addRemotePlayerListener("onPlayHereRequested", ({ positionSec }) => {
        playHere(positionSec).catch((error) => {
          logAndCaptureError("Play here from the remote player failed", error);
        });
      }),
      addRemotePlayerListener("onError", ({ error }) => {
        void showRemotePlayerFailure({
          message: remoteErrorMessage(latest.current.t, error),
          // Play here needs the play the screen shows, which a screen opened elsewhere has none of.
          canPlayHere: store.get(remotePlayAtom) !== null,
        });
      }),
      addRemotePlayerListener("onDismiss", () => {
        store.set(remotePlayAtom, null);
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription?.remove();
    };
  }, [routed, store]);

  return null;
}
