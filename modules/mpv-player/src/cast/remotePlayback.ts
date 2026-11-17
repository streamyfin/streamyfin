import { useEffect, useState } from "react";
import type {
  CastSubscription,
  ReceiverServerRecord,
  RemotePlaybackState,
} from "./Cast.types";
import { NO_REMOTE_PLAYBACK } from "./Cast.types";
import { CastNative } from "./CastModule";
import { subscribeToCast } from "./cast";

/**
 * What the TV plays, as the native holder of the remote engine publishes it. The
 * engine lives with the Cast session, not with a screen; nothing without the module.
 */
export const remotePlayback = (): RemotePlaybackState =>
  CastNative?.getRemotePlayback() ?? NO_REMOTE_PLAYBACK;

/** Each new state, sent on every change but the position. */
export const onRemotePlaybackChanged = (
  listener: (state: RemotePlaybackState) => void,
): CastSubscription =>
  subscribeToCast("onRemotePlaybackChanged", (state) => listener(state));

/**
 * The account's server, which the remote engine plays from and names in every
 * message; null drops the engine, sending nothing to the TV.
 */
export const setRemoteServer = async (
  server: ReceiverServerRecord | null,
): Promise<void> => {
  await CastNative?.setRemoteServer(server);
};

/** What the TV plays, followed. */
export const useRemotePlayback = (): RemotePlaybackState => {
  const [state, setState] = useState<RemotePlaybackState>(() =>
    remotePlayback(),
  );
  useEffect(() => {
    // Listener first, then the read: a change landing in between would be missed.
    const subscription = onRemotePlaybackChanged(setState);
    setState(remotePlayback());
    return () => subscription.remove();
  }, []);
  return state;
};
