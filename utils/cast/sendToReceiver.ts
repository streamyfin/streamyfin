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
import { liveTvBitrateRequest } from "@/utils/bitrate";
import {
  castToJellyfinReceiver,
  currentReceiverName,
  type JellyfinCastPlayRequest,
  parseReceiverCustomData,
  toReceiverRequest,
} from "@/utils/cast/jellyfinReceiver";
import { currentPlayChoice } from "@/utils/cast/playTarget";
import { castNotStartedMessage } from "@/utils/cast/receiverLoadErrorMessage";
import { bitrateRequestFor } from "@/utils/cast/remoteQuality";
import { watchLoadedCast } from "@/utils/cast/watchLoadedCast";
import { autoBitrateOptions } from "@/utils/jellyfin/autoBitrateOptions";
import { resolveMaxStreamingBitrate } from "@/utils/jellyfin/maxStreamingBitrate";
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

/** Counts follows, so one whose status read ends after a newer load's follow starts nothing. */
let follows = 0;

/**
 * The load answer comes at the first buffering status: a stream the receiver fails on later is followed from here,
 * told from the next load by the play session the receiver opened for it, read off the status held. The receiver
 * plays the video whatever happens here, so a follow that cannot start is only logged.
 */
const followLoad = async (
  client: CastClient,
  request: JellyfinCastPlayRequest,
  receiverName: string,
  userId: string,
) => {
  // Read at the answer: a play chosen while the status is read is the user's next one, which a failure gives way to.
  const choice = currentPlayChoice();
  const follow = ++follows;
  try {
    // What the receiver plays, which its statuses name: a guide program goes as its channel.
    const sent = toReceiverRequest(request);
    const loaded = sent.items[0];
    const held = parseReceiverCustomData(
      (await client.getMediaStatus().catch(() => null))?.mediaInfo?.customData,
    );
    if (follow !== follows) return;
    watchLoadedCast(client, {
      item: loaded,
      sent: {
        itemId: loaded.Id ?? "",
        mediaSourceId: sent.mediaSourceId,
        audioIndex: sent.audioStreamIndex,
        subtitleIndex: sent.subtitleStreamIndex,
        playbackPositionTicks: sent.startPositionTicks,
      },
      receiverName,
      playSessionId: held.itemId === loaded.Id ? held.playSessionId : null,
      choice,
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
    // The item page's quality is this device's: a receiver plays at the remote one, read now as the session is,
    // with the admin's lock as the settings page shows it. Live TV plays without a cap unless one was picked.
    const settings = deps.store.get(effectiveSettingsAtom);
    const quality = liveTvBitrateRequest(
      play.item,
      bitrateRequestFor(remote, settings?.remotePlaybackQuality),
    );
    const request: JellyfinCastPlayRequest = {
      items: [play.item],
      startPositionTicks: play.positionTicks,
      mediaSourceId: play.mediaSourceId,
      audioStreamIndex: play.audioIndex,
      subtitleStreamIndex: play.subtitleIndex,
    };
    const outcome = await castToJellyfinReceiver(
      client,
      // Handed over unbuilt: the load takes its turn now, and a cast picked while Auto measures replaces it. The
      // receiver knows no Auto: it gets the bitrate measured here, and its own ceiling for no cap.
      (async () => ({
        api: deps.api,
        userId: deps.userId,
        receiverName,
        maxBitrate: await resolveMaxStreamingBitrate(
          deps.api,
          quality,
          autoBitrateOptions(settings),
        ),
      }))(),
      request,
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
    // Not waited for: the hand-off closes the player at this answer, which a status read that hangs must not hold.
    void followLoad(client, request, receiverName, deps.userId);
    return { status: "loaded" };
  } catch (e) {
    logAndCaptureError("Chromecast playback failed", e);
    return {
      status: "failed",
      message: deps.t("player.chromecast_playback_failed"),
    };
  }
};
