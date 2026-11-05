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

/** What the player does once the receiver answered the hand-off. */
export type HandOffStep =
  | { kind: "dismiss" }
  | { kind: "notice"; message: string }
  | { kind: "resume" };

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
 * Loaded, the player closes and the receiver's controls open; refused, the player stays, says why and plays on;
 * replaced by another send, it plays on without a word.
 */
export const nextStepAfterSend = (result: SendResult): HandOffStep => {
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
