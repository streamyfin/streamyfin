import { useEffect, useState } from "react";
import type {
  CastSubscription,
  ReceiverPlayRequest,
  ReceiverServerRecord,
  RemoteLoadResult,
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

/** What a load answers where the module is absent, as a native one with no engine does. */
const NO_MODULE_LOAD: RemoteLoadResult = Object.freeze({
  outcome: "notSent",
  error: "No Cast module in this build",
});

/**
 * Loads on the TV through the remote engine of the Cast session, under this server;
 * resolves when the load settles: loaded, replaced by a later one, timed out, failed,
 * or not sent at all.
 */
export const loadOnReceiver = async (
  server: ReceiverServerRecord,
  request: ReceiverPlayRequest,
): Promise<RemoteLoadResult> => {
  if (!CastNative) return { ...NO_MODULE_LOAD };
  return CastNative.loadOnReceiver(server, request);
};

/** Reloads what the TV plays under this server, from where it is (a new bitrate cap). */
export const reloadOnReceiver = async (
  server: ReceiverServerRecord,
): Promise<void> => {
  await CastNative?.reloadOnReceiver(server);
};

/** Next or previous inside the receiver's queue: how a list that is not a series moves. */
export const skipOnReceiver = async (
  direction: "next" | "previous",
): Promise<void> => {
  await CastNative?.skipOnReceiver(direction);
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
