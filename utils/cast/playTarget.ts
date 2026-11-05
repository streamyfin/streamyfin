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
 * the wait instead, no target and why.
 */
export const waitForTarget = (
  read: () => RemoteTargetState = remoteTarget,
  listen: (listener: (state: RemoteTargetState) => void) => {
    remove(): void;
  } = onRemoteTargetChanged,
): Promise<RemoteTargetState> =>
  new Promise((resolve) => {
    let settled = false;
    const settle = (state: RemoteTargetState) => {
      if (settled || state.state === "connecting") return;
      settled = true;
      subscription.remove();
      resolve(state);
    };
    // Listener first, then the read: a change landing in between would be missed.
    const subscription = listen(settle);
    settle(read());
  });
