import type { createStore } from "jotai";
import { AUTO_BITRATE_VALUE } from "@/constants/Bitrate";
import { RECEIVER_UNCAPPED_BITRATE } from "@/constants/Cast";
import {
  currentCastSession,
  loadOnReceiver,
  type RemoteTarget,
} from "@/modules/mpv-player/src/cast";
import type {
  ReceiverPlayRequest,
  RemoteLoadResult,
} from "@/modules/mpv-player/src/cast/Cast.types";
import {
  presentRemotePlayer,
  showRemotePlayerFailure,
  updateRemotePlayer,
  updateRemotePlayerTint,
} from "@/modules/mpv-player/src/RemotePlayerPresentation";
import type { RemotePlayerPresentConfig } from "@/modules/mpv-player/src/RemotePlayerPresentation.types";
import { remotePlayAtom } from "@/utils/atoms/remotePlayer";
import { effectiveSettingsAtom } from "@/utils/atoms/settings";
import { liveTvBitrateRequest } from "@/utils/bitrate";
import {
  receiverNameFor,
  toReceiverRequest,
} from "@/utils/cast/jellyfinReceiver";
import { remoteErrorMessage } from "@/utils/cast/receiverLoadErrorMessage";
import { autoBitrateOn, bitrateRequestFor } from "@/utils/cast/remoteQuality";
import type {
  ReceiverPlay,
  SendDeps,
  SendResult,
} from "@/utils/cast/sendToReceiver";
import { getJellyfinHeaders } from "@/utils/customHeaders";
import { extractImageColor } from "@/utils/imageColors";
import { autoBitrateOptions } from "@/utils/jellyfin/autoBitrateOptions";
import { resolveMaxStreamingBitrate } from "@/utils/jellyfin/maxStreamingBitrate";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";
import { buildRemotePlayerConfig } from "./buildRemotePlayerConfig";
import { remoteTint } from "./remoteTint";

/** What `sendToReceiver` gets, with a store that can also say what the remote player shows. */
export interface RemotePlayDeps extends Omit<SendDeps, "store"> {
  store: Pick<ReturnType<typeof createStore>, "get" | "set">;
}

/** Counts sends, so an older one's tint or outcome never lands over a newer one's screen. */
let sends = 0;

/** The sentence for a load the TV did not start, or null when it did or a later load replaced it. */
const notStartedMessage = (
  deps: RemotePlayDeps,
  result: RemoteLoadResult,
): string | null => {
  switch (result.outcome) {
    case "timedOut":
      return deps.t("player.chromecast_did_not_start");
    case "failed":
      return remoteErrorMessage(deps.t, result.error);
    case "notSent":
      return deps.t("cast.output.failed");
    default:
      return null;
  }
};

/** The artwork's color, faded in once known; never waited for, and dropped once a newer send owns the screen. */
const followTint = async (
  config: RemotePlayerPresentConfig,
  send: number,
): Promise<void> => {
  const { artworkUri, artworkHeaders } = config.metadata;
  if (!artworkUri) return;
  try {
    const color = await extractImageColor(artworkUri, artworkHeaders);
    if (color === null || send !== sends) return;
    await updateRemotePlayerTint(remoteTint(color));
  } catch (error) {
    // An artwork that does not load leaves the neutral, which reads as well.
    writeErrorLog("The remote player's tint could not be read", error);
  }
};

/**
 * Plays on the TV through the remote player: the screen opens at once on the neutral (or takes the new play in place
 * when it is up), then the Cast session's engine loads on the receiver under the account's envelope, at the remote
 * quality's cap. The receiver reports the playback to the server itself: nothing is reported from here. A load the TV
 * does not start is said on the screen, with Play here; only a screen that could not open is the caller's to say.
 */
export const playOnRemote = async (
  deps: RemotePlayDeps,
  play: ReceiverPlay,
  remote: RemoteTarget,
  isStale: () => boolean,
): Promise<SendResult> => {
  if (isStale()) return { status: "superseded" };
  const send = ++sends;
  // The screen opens for this session's TV: a switch to another one by the time the load leaves sends nothing.
  const session = currentCastSession();
  const settings = deps.store.get(effectiveSettingsAtom);
  const quality = liveTvBitrateRequest(
    play.item,
    bitrateRequestFor(remote, settings?.remotePlaybackQuality),
  );
  let config: RemotePlayerPresentConfig;
  deps.store.set(remotePlayAtom, { play, loaded: false });
  try {
    config = buildRemotePlayerConfig({
      item: play.item,
      mediaSource:
        play.item.MediaSources?.find(
          (source) => source.Id === play.mediaSourceId,
        ) ??
        play.item.MediaSources?.[0] ??
        null,
      targetName: remote.name,
      audioIndex: play.audioIndex,
      subtitleIndex: play.subtitleIndex,
      // The TV gets the item alone for now, as `sendToReceiver` sends it: no list to show yet.
      episodeList: [],
      nextEpisode: null,
      tint: null,
      imageHeaders: getJellyfinHeaders(deps.api.basePath),
      settings,
      api: deps.api,
      t: deps.t,
      bitrateValue: quality,
    });
    if (!(await updateRemotePlayer(config))) await presentRemotePlayer(config);
  } catch (error) {
    // Refused natively (no remote engine for the session, a player already up), or no config to show: nothing
    // opened, the caller says it.
    logAndCaptureError("The remote player did not open", error);
    if (send === sends) deps.store.set(remotePlayAtom, null);
    return { status: "failed", message: deps.t("cast.output.failed") };
  }
  void followTint(config, send);

  const failed = async (message: string): Promise<SendResult> => {
    if (send === sends) {
      await showRemotePlayerFailure({ message, canPlayHere: true });
    }
    return { status: "notStarted", message };
  };
  try {
    // The receiver knows no Auto: it gets the bitrate measured here, held under a stick's ceiling, and its own
    // ceiling for no cap, as `sendToReceiver` hands it.
    const measured = await resolveMaxStreamingBitrate(
      deps.api,
      quality,
      autoBitrateOptions(settings),
    );
    const bitrate =
      quality === AUTO_BITRATE_VALUE
        ? autoBitrateOn(measured, session?.device?.modelName)
        : measured;
    // A press made while Auto measured owns the screen now, or another TV took the session: this one sends nothing.
    if (
      isStale() ||
      send !== sends ||
      currentCastSession()?.id !== session?.id
    ) {
      return { status: "superseded" };
    }
    const receiverName = receiverNameFor({ friendlyName: remote.name });
    const sent = toReceiverRequest({
      items: [play.item],
      startPositionTicks: play.positionTicks,
      mediaSourceId: play.mediaSourceId,
      audioStreamIndex: play.audioIndex,
      subtitleStreamIndex: play.subtitleIndex,
    });
    const request: ReceiverPlayRequest = {
      items: sent.items.map((item) => ({
        id: item.Id ?? "",
        name: item.Name ?? undefined,
        type: item.Type ?? undefined,
        mediaType: item.MediaType ?? undefined,
        isFolder: item.IsFolder ?? false,
      })),
      startPositionTicks: sent.startPositionTicks,
      mediaSourceId: sent.mediaSourceId,
      audioStreamIndex: sent.audioStreamIndex,
      subtitleStreamIndex: sent.subtitleStreamIndex,
    };
    const result = await loadOnReceiver(
      {
        serverAddress: deps.api.basePath,
        accessToken: deps.api.accessToken,
        userId: deps.userId,
        ...(receiverName ? { receiverName } : {}),
        maxBitrate: Math.min(
          bitrate || RECEIVER_UNCAPPED_BITRATE,
          RECEIVER_UNCAPPED_BITRATE,
        ),
      },
      request,
    );
    const message = notStartedMessage(deps, result);
    if (message) {
      writeErrorLog("The TV did not start the remote play", result);
      return failed(message);
    }
    if (result.outcome !== "loaded") return { status: "superseded" };
    if (send === sends) deps.store.set(remotePlayAtom, { play, loaded: true });
    return { status: "loaded" };
  } catch (error) {
    logAndCaptureError("The remote play failed", error);
    return failed(deps.t("player.chromecast_playback_failed"));
  }
};
