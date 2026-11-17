import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  type CastClient,
  CastIdleReason,
  CastMediaPlayerState,
  type CastMediaStatus,
  onCastSessionEvent,
} from "@/modules/mpv-player/src/cast";
import { parseReceiverCustomData } from "@/utils/cast/jellyfinReceiver";
import { playRequestFromReceiver } from "@/utils/cast/playRequestFromReceiver";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";

/** A video this phone sent, as the receiver reported it loaded. */
export interface LoadedCast {
  item: BaseItemDto;
  /** What was sent: the item, its streams and where it started. */
  sent: Omit<PlayRequest, "offline">;
  receiverName: string;
  /** The receiver's play session for this load, which tells it from the next one; null when it named none. */
  playSessionId: string | null;
  /** The play choice when it loaded: a later one means the user moved on. */
  choice: number;
  userId: string;
}

/** A load the receiver stopped on with an error. */
export interface CastPlaybackFailure
  extends Pick<LoadedCast, "item" | "receiverName" | "choice" | "userId"> {
  /** Where to go on here: where the receiver last played it, with the streams it showed; the send otherwise. */
  request: Omit<PlayRequest, "offline">;
}

type FailureListener = (failure: CastPlaybackFailure) => void;

const listeners = new Set<FailureListener>();

/** Calls `listener` with each load the receiver stops on with an error. */
export const onCastPlaybackFailed = (
  listener: FailureListener,
): { remove(): void } => {
  // Wrapped: the set would merge two subscriptions of one function.
  const entry: FailureListener = (failure) => listener(failure);
  listeners.add(entry);
  return { remove: () => listeners.delete(entry) };
};

let stopCurrent: (() => void) | null = null;

/**
 * Follows a load the receiver reported loaded until it ends, and reports it when the receiver stops on it with an
 * error: a stream that breaks after its first frames, a transcode the receiver cannot read. The load answer comes
 * at the first buffering status, so such a failure reaches no one else: the player that handed off closed, and the
 * page that sent may be gone. A natural end, a stop, another load, the media gone or the session ended stop the
 * watch quietly, and so does the next watch. Returns a function that stops it.
 */
export const watchLoadedCast = (
  client: Pick<CastClient, "sessionId" | "onMediaStatusUpdated">,
  load: LoadedCast,
): (() => void) => {
  stopCurrent?.();
  // Where the receiver last played the load: none until it played or paused, buffering says nothing of it.
  let played: Omit<PlayRequest, "offline"> | null = null;
  let statusUpdates: { remove(): void } | undefined;
  let sessionEvents: { remove(): void } | undefined;

  const stop = () => {
    statusUpdates?.remove();
    sessionEvents?.remove();
    if (stopCurrent === stop) stopCurrent = null;
  };

  const isThisLoad = (status: CastMediaStatus): boolean => {
    const data = parseReceiverCustomData(status.mediaInfo?.customData);
    return load.playSessionId
      ? data.playSessionId === load.playSessionId
      : data.itemId === load.item.Id;
  };

  statusUpdates = client.onMediaStatusUpdated((status) => {
    if (!status) return stop();
    const idle = status.playerState === CastMediaPlayerState.IDLE;
    // The iOS SDK drops the media from an idle status: one without media is this load's own end, while a status
    // naming another load's media, or a playing one with none, means this load is gone.
    if (status.mediaInfo ? !isThisLoad(status) : !idle) return stop();
    if (!idle) {
      if (
        status.playerState === CastMediaPlayerState.PLAYING ||
        status.playerState === CastMediaPlayerState.PAUSED
      ) {
        played = playRequestFromReceiver(status) ?? played;
      }
      return;
    }
    // Idle with no reason yet comes between two states; any other reason ends the load.
    if (!status.idleReason || status.idleReason === CastIdleReason.NONE) return;
    stop();
    if (status.idleReason !== CastIdleReason.ERROR) return;
    const failure: CastPlaybackFailure = {
      item: load.item,
      request: played ?? load.sent,
      receiverName: load.receiverName,
      choice: load.choice,
      userId: load.userId,
    };
    for (const listener of listeners) listener(failure);
  });
  // Android reports an ended session without its id.
  sessionEvents = onCastSessionEvent(({ event, sessionId }) => {
    if (
      event === "ended" &&
      (sessionId === null || sessionId === client.sessionId)
    ) {
      stop();
    }
  });
  stopCurrent = stop;
  return stop;
};
