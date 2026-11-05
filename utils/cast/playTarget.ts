import { PLAY_TARGET_WAIT_MS } from "@/constants/Cast";
import {
  onRemoteTargetChanged,
  remoteTarget,
} from "@/modules/mpv-player/src/cast";
import type { RemoteTargetState } from "@/modules/mpv-player/src/cast/Cast.types";

/** Where the Play button sends playback. */
export type PlayDestination =
  | { where: "target"; name: string }
  | { where: "here"; reason?: "download" }
  | { where: "waitForTarget"; name: string };

/**
 * The single Play action (#2219): a connected target gets the play and the button names it, a long press
 * plays here, a download plays here as it cannot be cast, and a press while connecting waits for the target.
 */
export const resolvePlay = ({
  target,
  offline,
  longPress,
}: {
  target: RemoteTargetState;
  offline: boolean;
  longPress: boolean;
}): PlayDestination => {
  const remote = target.target;
  if (
    !remote ||
    (target.state !== "connected" && target.state !== "connecting")
  ) {
    return { where: "here" };
  }
  if (offline) return { where: "here", reason: "download" };
  if (longPress) return { where: "here" };
  return target.state === "connected"
    ? { where: "target", name: remote.name }
    : { where: "waitForTarget", name: remote.name };
};

/**
 * Waits out the connection a press landed in: resolves with the connected state, or with the one that ended
 * the wait instead, no target and why (no error for a connection cancelled from the sheet). "timeout" once
 * `timeoutMs` passes without either, "aborted" once `signal` fires.
 */
export const waitForTarget = (
  read: () => RemoteTargetState = remoteTarget,
  listen: (listener: (state: RemoteTargetState) => void) => {
    remove(): void;
  } = onRemoteTargetChanged,
  {
    timeoutMs = PLAY_TARGET_WAIT_MS,
    signal,
  }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RemoteTargetState | "timeout" | "aborted"> =>
  new Promise((resolve) => {
    let settled = false;
    let subscription: { remove(): void } | undefined;
    const finish = (outcome: RemoteTargetState | "timeout" | "aborted") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      subscription?.remove();
      resolve(outcome);
    };
    // A cancel goes through ending on its way to none: the wait ends with the end.
    const settle = (state: RemoteTargetState) => {
      if (state.state !== "connecting" && state.state !== "ending")
        finish(state);
    };
    const onAbort = () => finish("aborted");
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    signal?.addEventListener("abort", onAbort);
    // Listener first, then the read: a change landing in between would be missed.
    subscription = listen(settle);
    if (settled) subscription.remove();
    else if (signal?.aborted) finish("aborted");
    else settle(read());
  });
