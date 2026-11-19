import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { RemoteTarget } from "@/modules/mpv-player/src/cast";
import type { ReceiverPlay, SendResult } from "@/utils/cast/sendToReceiver";
import {
  playOnRemote,
  type RemotePlayDeps,
} from "@/utils/remotePlayer/playOnRemote";
import { toServerSubtitleIndex } from "@/utils/subtitles/subtitleIndex";
import { secondsToTicks } from "@/utils/time";

/** What the hand-off reads from the native player's session. */
export interface HandOffSession {
  item: BaseItemDto;
  mediaSourceId?: string;
  currentAudioIndex: number | undefined;
  currentSubtitleIndex: number;
  /** An in-place swap whose stream has not loaded yet: the native position is still the outgoing stream's. */
  awaitingLoad: boolean;
  /** The position JS tracks, the incoming item's start until its stream loads. */
  positionMs: number;
}

/** What the player does after a hand-off that goes nowhere. */
export type HandOffStep = { kind: "resume" } | { kind: "none" };

/** The player's hand-off, and what the app holds when it arrives. */
export interface HandOffRequest {
  /** The item the native player played when its sheet handed it off. */
  itemId: string | undefined;
  /** The session JS holds: during an in-place swap, already the next item's. */
  session: HandOffSession | null;
  /** The player plays for a SyncPlay group, which may have been joined while the sheet was open. */
  inSyncPlay: boolean;
  receiverConnected: boolean;
  /** The player played before the hand-off paused it: a video paused before stays paused when nothing goes. */
  wasPlaying: boolean;
}

/**
 * Whether the hand-off goes to the receiver: one is connected, the player plays for no SyncPlay group, and the
 * session still holds the item the player handed off.
 */
export const mayHandOff = (request: HandOffRequest): boolean =>
  !!request.session &&
  request.receiverConnected &&
  !request.inSyncPlay &&
  (request.itemId === undefined || request.itemId === request.session.item.Id);

/**
 * The item the player plays, for the receiver: where the player stopped, from the source and the streams chosen in
 * it. A subtitle file on this device has no server stream, so the receiver plays without subtitles. A live channel
 * has no position to go on from: the receiver joins it live, as the item page's Play sends it. During an in-place
 * swap the player still reports the outgoing stream, so the incoming item goes from the position JS tracks for it.
 */
export const resolveCastHandOff = (
  session: HandOffSession,
  positionSec: number,
): ReceiverPlay => ({
  item: session.item,
  positionTicks:
    session.item.Type === "TvChannel"
      ? 0
      : secondsToTicks(
          session.awaitingLoad ? session.positionMs / 1000 : positionSec,
        ),
  mediaSourceId: session.mediaSourceId,
  audioIndex: session.currentAudioIndex,
  subtitleIndex: toServerSubtitleIndex(session.currentSubtitleIndex),
});

/**
 * The player paused for a hand-off that goes nowhere: it plays on if it was playing, unless it plays for a SyncPlay
 * group, whose next command plays it.
 */
export const stepAfterRefusal = (request: HandOffRequest): HandOffStep =>
  request.inSyncPlay || !request.wasPlaying
    ? { kind: "none" }
    : { kind: "resume" };

/**
 * The hand-off once it goes: the local player closes, then the remote player opens on the TV where it was, and the
 * TV loads it. Native refuses the remote screen over the local one. A load the TV does not start is said on the remote
 * screen, with Play here; only a screen that could not open is the caller's to say.
 */
export const handOffToRemote = async (
  deps: RemotePlayDeps & { closeLocalPlayer: () => Promise<void> },
  session: HandOffSession,
  positionSec: number,
  remote: RemoteTarget,
  isStale: () => boolean,
): Promise<SendResult> => {
  // Read before the player closes: the session goes with it.
  const play = resolveCastHandOff(session, positionSec);
  await deps.closeLocalPlayer();
  return playOnRemote(deps, play, remote, isStale);
};
