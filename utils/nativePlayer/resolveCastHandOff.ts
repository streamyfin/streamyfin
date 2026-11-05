import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { ReceiverPlay, SendResult } from "@/utils/cast/sendToReceiver";
import { toServerSubtitleIndex } from "@/utils/subtitles/subtitleIndex";
import { secondsToTicks } from "@/utils/time";

/** What the hand-off reads from the native player's session. */
export interface HandOffSession {
  item: BaseItemDto;
  mediaSourceId?: string;
  currentAudioIndex: number | undefined;
  currentSubtitleIndex: number;
}

/** What the player does once the receiver answered the hand-off; nothing when a newer hand-off owns the player. */
export type HandOffStep =
  | { kind: "dismiss" }
  | { kind: "notice"; message: string }
  | { kind: "resume" }
  | { kind: "none" };

/** The player's hand-off, and what the app holds when it arrives. */
export interface HandOffRequest {
  /** The item the native player played when its sheet handed it off. */
  itemId: string | undefined;
  /** The session JS holds: during an in-place swap, already the next item's. */
  session: HandOffSession | null;
  /** The player plays for a SyncPlay group, which may have been joined while the sheet was open. */
  inSyncPlay: boolean;
  receiverConnected: boolean;
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
 * it. A subtitle file on this device has no server stream, so the receiver plays without subtitles.
 */
export const resolveCastHandOff = (
  session: HandOffSession,
  positionSec: number,
): ReceiverPlay => ({
  item: session.item,
  positionTicks: secondsToTicks(positionSec),
  mediaSourceId: session.mediaSourceId,
  audioIndex: session.currentAudioIndex,
  subtitleIndex: toServerSubtitleIndex(session.currentSubtitleIndex),
});

/**
 * The player paused for a hand-off that goes nowhere: it plays on, unless it plays for a SyncPlay group, whose next
 * command plays it.
 */
export const stepAfterRefusal = (request: HandOffRequest): HandOffStep =>
  request.inSyncPlay ? { kind: "none" } : { kind: "resume" };

/**
 * Loaded, the player closes and the receiver's controls open; refused, the player stays, says why and plays on;
 * replaced by another send, it plays on without a word. A hand-off a newer one replaced (`latest` false) leaves the
 * player to the newer one, and one a SyncPlay join overtook (`inSyncPlay`) leaves it to the group.
 */
export const nextStepAfterSend = (
  result: SendResult,
  {
    latest = true,
    inSyncPlay = false,
  }: { latest?: boolean; inSyncPlay?: boolean } = {},
): HandOffStep => {
  if (!latest || inSyncPlay) return { kind: "none" };
  switch (result.status) {
    case "loaded":
      return { kind: "dismiss" };
    case "notStarted":
    case "failed":
      return { kind: "notice", message: result.message };
    case "superseded":
      return { kind: "resume" };
  }
};
