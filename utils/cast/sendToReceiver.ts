import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import type { createStore } from "jotai";
import { RECEIVER_LOAD_TIMEOUT_MS } from "@/constants/Cast";
import {
  castClientFor,
  currentCastSession,
  type RemoteTarget,
} from "@/modules/mpv-player/src/cast";
import { effectiveSettingsAtom } from "@/utils/atoms/settings";
import {
  castToJellyfinReceiver,
  currentReceiverName,
} from "@/utils/cast/jellyfinReceiver";
import { castNotStartedMessage } from "@/utils/cast/receiverLoadErrorMessage";
import { maxBitrateFor } from "@/utils/cast/remoteQuality";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";

/** What to play on the receiver: an item, where to start, and the streams chosen for it. */
export interface ReceiverPlay {
  item: BaseItemDto;
  positionTicks: number;
  mediaSourceId?: string;
  audioIndex?: number;
  subtitleIndex?: number;
}

/** How a send went; whatever did not start carries the sentence to show. */
export type SendResult =
  | { status: "loaded" }
  | { status: "superseded" }
  | { status: "notStarted"; message: string }
  | { status: "failed"; message: string };

export interface SendDeps {
  api: Api;
  userId: string;
  store: Pick<ReturnType<typeof createStore>, "get">;
  t: TFunction;
}

/**
 * Sends an item to the connected receiver at a position, as the item page's Play does and the player's hand-off.
 * The official Jellyfin receiver negotiates playback on its own: it is handed the item and the chosen streams and
 * runs PlaybackInfo itself, which opens a real Jellyfin session. Nothing is sent once `isStale` says the caller moved
 * on, nor for a Cast session other than the one read here. Alerts and the expanded controls are the caller's.
 */
export const sendToReceiver = async (
  deps: SendDeps,
  play: ReceiverPlay,
  remote: RemoteTarget,
  isStale: () => boolean,
): Promise<SendResult> => {
  try {
    // Read now: a press that waited for the connection holds an older render. The read can throw on Android once the
    // module lost its React context, which the catch below reports like a failed load.
    const session = currentCastSession();
    const client = session ? castClientFor(session) : null;
    if (!session || !client) {
      return { status: "failed", message: deps.t("cast.output.failed") };
    }
    const outcome = await castToJellyfinReceiver(
      client,
      {
        api: deps.api,
        userId: deps.userId,
        receiverName: (await currentReceiverName()) ?? remote.name,
        // The item page's quality is this device's: a receiver plays at the remote one, read now as the session is,
        // with the admin's lock as the settings page shows it.
        maxBitrate: maxBitrateFor(
          remote,
          deps.store.get(effectiveSettingsAtom).remotePlaybackQuality,
        ),
      },
      {
        items: [play.item],
        startPositionTicks: play.positionTicks,
        mediaSourceId: play.mediaSourceId,
        audioStreamIndex: play.audioIndex,
        subtitleStreamIndex: play.subtitleIndex,
      },
      RECEIVER_LOAD_TIMEOUT_MS,
      // The load reads the receiver before it sends, and the send goes to the current session: another receiver by
      // then, or a caller that moved on, gets nothing sent.
      () => currentCastSession()?.id !== session.id || isStale(),
    );
    const notStarted = castNotStartedMessage(deps.t, outcome);
    if (notStarted) {
      writeErrorLog("Chromecast did not start", outcome);
      return { status: "notStarted", message: notStarted };
    }
    return outcome.status === "loaded"
      ? { status: "loaded" }
      : { status: "superseded" };
  } catch (e) {
    logAndCaptureError("Chromecast playback failed", e);
    return {
      status: "failed",
      message: deps.t("player.chromecast_playback_failed"),
    };
  }
};
