import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import type { createStore } from "jotai";
import { RECEIVER_LOAD_TIMEOUT_MS } from "@/constants/Cast";
import {
  type CastClient,
  castClientFor,
  currentCastSession,
  type RemoteTarget,
} from "@/modules/mpv-player/src/cast";
import { effectiveSettingsAtom } from "@/utils/atoms/settings";
import {
  castToJellyfinReceiver,
  currentReceiverName,
  parseReceiverCustomData,
} from "@/utils/cast/jellyfinReceiver";
import { currentPlayChoice } from "@/utils/cast/playTarget";
import { castNotStartedMessage } from "@/utils/cast/receiverLoadErrorMessage";
import { maxBitrateFor } from "@/utils/cast/remoteQuality";
import { watchLoadedCast } from "@/utils/cast/watchLoadedCast";
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
 * The load answer comes at the first buffering status: a stream the receiver fails on later is followed from here,
 * told from the next load by the play session the receiver opened for it, read off the status held. The receiver
 * plays the video whatever happens here, so a follow that cannot start is only logged.
 */
const followLoad = async (
  client: CastClient,
  play: ReceiverPlay,
  receiverName: string,
  userId: string,
) => {
  try {
    const held = parseReceiverCustomData(
      (await client.getMediaStatus().catch(() => null))?.mediaInfo?.customData,
    );
    watchLoadedCast(client, {
      item: play.item,
      sent: {
        itemId: play.item.Id ?? "",
        mediaSourceId: play.mediaSourceId,
        audioIndex: play.audioIndex,
        subtitleIndex: play.subtitleIndex,
        playbackPositionTicks: play.positionTicks,
      },
      receiverName,
      playSessionId: held.itemId === play.item.Id ? held.playSessionId : null,
      choice: currentPlayChoice(),
      userId,
    });
  } catch (error) {
    writeErrorLog("The loaded cast could not be followed", error);
  }
};

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
    const receiverName = (await currentReceiverName()) ?? remote.name;
    const outcome = await castToJellyfinReceiver(
      client,
      {
        api: deps.api,
        userId: deps.userId,
        receiverName,
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
    if (outcome.status !== "loaded") return { status: "superseded" };
    await followLoad(client, play, receiverName, deps.userId);
    return { status: "loaded" };
  } catch (e) {
    logAndCaptureError("Chromecast playback failed", e);
    return {
      status: "failed",
      message: deps.t("player.chromecast_playback_failed"),
    };
  }
};
