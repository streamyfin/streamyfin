import { PLAY_TARGET_WAIT_MS } from "@/constants/Cast";
import {
  onRemoteTargetChanged,
  remoteTarget,
} from "@/modules/mpv-player/src/cast";
import type { RemoteTargetState } from "@/modules/mpv-player/src/cast/Cast.types";
import { parseRemotePlayCommand } from "@/utils/nativePlayer/parseRemotePlayCommand";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";

let playChoice = 0;

/**
 * Records a play choice and returns its number. Every play the app starts is one, on purpose, not only a cast: a
 * Play button here or on the receiver, any play through usePlayMedia (a Shuffle, a Continue here's own play), and a
 * Play command from another Jellyfin client (chooseRemotePlay). A page left under another stays mounted, so a
 * receiver load or a Continue here still on its way acts only while its choice is the latest.
 */
export const choosePlay = (): number => {
  playChoice += 1;
  return playChoice;
};

/**
 * Reads a Jellyfin "Play" command from another client and, when it names an item, records it as a play choice: a
 * Continue here or a receiver load still on its way gives way to it, as to a Play pressed here.
 */
export const chooseRemotePlay = (command: unknown): PlayRequest | null => {
  const request = parseRemotePlayCommand(command);
  if (request) choosePlay();
  return request;
};

/** True while no play choice came after this one. */
export const isLatestPlayChoice = (choice: number): boolean =>
  choice === playChoice;

/** The latest play choice, for what started without one of its own (a hand-off) and gives way to the next. */
export const currentPlayChoice = (): number => playChoice;

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
