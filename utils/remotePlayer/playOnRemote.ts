import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import type { createStore } from "jotai";
import { AUTO_BITRATE_VALUE } from "@/constants/Bitrate";
import { RECEIVER_UNCAPPED_BITRATE } from "@/constants/Cast";
import {
  currentCastSession,
  loadOnReceiver,
  type RemoteTarget,
} from "@/modules/mpv-player/src/cast";
import type {
  ReceiverPlayItem,
  ReceiverPlayRequest,
  RemoteLoadResult,
  RemotePlaybackState,
} from "@/modules/mpv-player/src/cast/Cast.types";
import {
  presentRemotePlayer,
  showRemotePlayerFailure,
  updateRemotePlayer,
  updateRemotePlayerTint,
} from "@/modules/mpv-player/src/RemotePlayerPresentation";
import type {
  RemotePlayerPresentConfig,
  RemotePlayerTint,
} from "@/modules/mpv-player/src/RemotePlayerPresentation.types";
import { userAtom } from "@/utils/atoms/api";
import { remoteForeignAtom, remotePlayAtom } from "@/utils/atoms/remotePlayer";
import { effectiveSettingsAtom, type Settings } from "@/utils/atoms/settings";
import { type BitrateRequest, liveTvBitrateRequest } from "@/utils/bitrate";
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
import { fetchAndParseSegments, toNativeSegments } from "@/utils/segments";
import { secondsToTicks } from "@/utils/time";
import { type BoundedQueue, boundedEpisodeQueue } from "./boundedEpisodeQueue";
import {
  buildReducedRemotePlayerConfig,
  buildRemotePlayerConfig,
  mediaSourceOf,
} from "./buildRemotePlayerConfig";
import {
  episodeAfter,
  remoteEpisodeList,
  remoteNextUp,
} from "./remoteEpisodes";
import { remoteTint } from "./remoteTint";
import { type SeriesEpisode, seriesEpisodes } from "./seriesEpisodes";

/** What `sendToReceiver` gets, with a store that can also say what the remote player shows. */
export interface RemotePlayDeps extends Omit<SendDeps, "store"> {
  store: Pick<ReturnType<typeof createStore>, "get" | "set">;
}

/** Counts sends, so an older one's tint or outcome never lands over a newer one's screen. */
let sends = 0;
/** The tint the newest send faded in, carried by the config that later takes the screen in place. */
let shownTint: { send: number; tint: RemotePlayerTint } | null = null;

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
    const tint = remoteTint(color);
    shownTint = { send, tint };
    await updateRemotePlayerTint(tint);
  } catch (error) {
    // An artwork that does not load leaves the neutral, which reads as well.
    writeErrorLog("The remote player's tint could not be read", error);
  }
};

/** The item's segments in the user's skip modes; none when the server cannot say, as they never fail a play. */
const segmentsOf = async (
  deps: RemotePlayDeps,
  item: BaseItemDto,
): Promise<RemotePlayerPresentConfig["segments"]> => {
  if (!item.Id) return [];
  try {
    return toNativeSegments(
      await fetchAndParseSegments(item.Id, deps.api),
      deps.store.get(effectiveSettingsAtom),
    );
  } catch (error) {
    writeErrorLog("The segments of what the TV plays could not be read", error);
    return [];
  }
};

/**
 * The segments of an item a follow showed, in place once read: never waited for, as a send does not (before 10.11
 * they are two reads). The update keeps the tracks the TV took and the tint read since.
 */
const showSegmentsLater = (
  deps: RemotePlayDeps,
  config: RemotePlayerPresentConfig,
  play: ReceiverPlay,
  remote: RemoteTarget,
  send: number,
): void => {
  segmentsOf(deps, play.item)
    .then(async (segments) => {
      if (segments.length === 0 || send !== sends) return;
      const held = deps.store.get(remotePlayAtom)?.play;
      const current = held && held.item.Id === play.item.Id ? held : play;
      await updateRemotePlayer({
        ...config,
        segments,
        tracks: configFor(deps, current, remote, [], null).tracks,
        tint: shownTint?.send === send ? shownTint.tint : config.tint,
      });
    })
    .catch((error) =>
      writeErrorLog("The remote player's segments could not be shown", error),
    );
};

/** What the screen shows of `play` on `remote`; the tint fades in once read. */
const configFor = (
  deps: RemotePlayDeps,
  play: ReceiverPlay,
  remote: RemoteTarget,
  episodeList: RemotePlayerPresentConfig["episodeList"],
  nextEpisode: RemotePlayerPresentConfig["nextEpisode"],
  segments: RemotePlayerPresentConfig["segments"] = [],
): RemotePlayerPresentConfig => {
  const settings = deps.store.get(effectiveSettingsAtom);
  return buildRemotePlayerConfig({
    item: play.item,
    mediaSource: mediaSourceOf(play),
    targetName: remote.name,
    audioIndex: play.audioIndex,
    subtitleIndex: play.subtitleIndex,
    episodeList,
    nextEpisode,
    segments,
    tint: null,
    imageHeaders: getJellyfinHeaders(deps.api.basePath),
    settings,
    api: deps.api,
    user: deps.store.get(userAtom),
    t: deps.t,
    bitrateValue: liveTvBitrateRequest(
      play.item,
      bitrateRequestFor(remote, settings?.remotePlaybackQuality),
    ),
  });
};

/** The series around an episode and the list the TV gets of it; null when the series cannot be read. */
const episodeListing = async (
  deps: RemotePlayDeps,
  play: ReceiverPlay,
  settings: Settings | null,
): Promise<{ episodes: SeriesEpisode[]; queue: BoundedQueue } | null> => {
  const seriesId = play.item.SeriesId;
  if (play.item.Type !== "Episode" || !seriesId) return null;
  try {
    const episodes = await seriesEpisodes(deps.api, deps.userId, seriesId);
    const index = episodes.findIndex(({ id }) => id === play.item.Id);
    if (index < 0) return null;
    const queue = boundedEpisodeQueue({
      episodes,
      index,
      startPositionTicks: play.positionTicks,
      autoPlayNextEpisode: settings?.autoPlayNextEpisode ?? false,
      preset: settings?.stillWatchingPreset,
    });
    return { episodes, queue };
  } catch (error) {
    writeErrorLog(
      "The series of the episode sent to the TV could not be read",
      error,
    );
    return null;
  }
};

/**
 * The cap a receiver gets for `quality`: it knows no Auto, so it gets the bitrate measured here, held under a stick's
 * ceiling, and its own ceiling for no cap, as `sendToReceiver` hands it.
 */
export const receiverBitrateFor = async (
  api: RemotePlayDeps["api"],
  quality: BitrateRequest,
  settings: Settings | null | undefined,
  model: string | null | undefined,
): Promise<number> => {
  const measured = await resolveMaxStreamingBitrate(
    api,
    quality,
    autoBitrateOptions(settings),
  );
  const bitrate =
    quality === AUTO_BITRATE_VALUE ? autoBitrateOn(measured, model) : measured;
  return Math.min(
    bitrate || RECEIVER_UNCAPPED_BITRATE,
    RECEIVER_UNCAPPED_BITRATE,
  );
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
  deps.store.set(remoteForeignAtom, null);
  try {
    // An episode's list and what comes after it follow once the series is read.
    config = configFor(deps, play, remote, [], null);
    if (!(await updateRemotePlayer(config))) await presentRemotePlayer(config);
  } catch (error) {
    // Refused natively (no remote engine for the session, a player already up), or no config to show: nothing
    // opened, the caller says it.
    logAndCaptureError("The remote player did not open", error);
    if (send === sends) deps.store.set(remotePlayAtom, null);
    return { status: "failed", message: deps.t("cast.output.failed") };
  }
  void followTint(config, send);
  // The list and the segments come to the screen in place, in either order: each update carries what came before.
  let shown = config;
  // Native clears a failure shown and applies the menus again on every update.
  let failureShown = false;
  const showMore = async (more: Partial<RemotePlayerPresentConfig>) => {
    if (isStale() || send !== sends || failureShown) return;
    // The tracks the TV took since the screen opened, not the ones it was sent.
    const held = deps.store.get(remotePlayAtom)?.play;
    const current = held && held.item.Id === play.item.Id ? held : play;
    shown = {
      ...shown,
      ...more,
      tracks: configFor(deps, current, remote, [], null).tracks,
      tint: shownTint?.send === send ? shownTint.tint : config.tint,
    };
    await updateRemotePlayer(shown);
  };
  // Never waited for: the load leaves without them.
  segmentsOf(deps, play.item)
    .then((segments) =>
      segments.length > 0 ? showMore({ segments }) : undefined,
    )
    .catch((error) =>
      writeErrorLog("The remote player's segments could not be shown", error),
    );
  // Read while Auto measures: the screen is up already, the list comes to it in place.
  const listing = episodeListing(deps, play, settings);

  const failed = async (message: string): Promise<SendResult> => {
    if (send === sends) {
      failureShown = true;
      await showRemotePlayerFailure({ message, canPlayHere: true });
    }
    return { status: "notStarted", message };
  };
  try {
    const bitrate = await receiverBitrateFor(
      deps.api,
      quality,
      settings,
      session?.device?.modelName,
    );
    // A press made while Auto measured owns the screen now, or another TV took the session: this one sends nothing.
    if (
      isStale() ||
      send !== sends ||
      currentCastSession()?.id !== session?.id
    ) {
      return { status: "superseded" };
    }
    const listed = await listing;
    if (isStale() || send !== sends) return { status: "superseded" };
    if (listed) {
      const nextUp = listed.episodes.find(
        ({ id }) => id === listed.queue.nextUpId,
      );
      await showMore({
        episodeList: remoteEpisodeList(
          deps.api,
          listed.episodes,
          play.item.Id ?? "",
        ),
        nextEpisode: remoteNextUp(deps.api, nextUp),
      });
    }
    const receiverName = receiverNameFor({ friendlyName: remote.name });
    const sent = toReceiverRequest({
      items: [play.item],
      startPositionTicks: play.positionTicks,
      mediaSourceId: play.mediaSourceId,
      audioStreamIndex: play.audioIndex,
      subtitleStreamIndex: play.subtitleIndex,
    });
    const items: ReceiverPlayItem[] =
      listed?.queue.items ??
      sent.items.map((item) => ({
        id: item.Id ?? "",
        name: item.Name ?? undefined,
        // An episode alone goes without its type: the receiver would unfold a typed one into its whole series.
        ...(item.Type && item.Type !== "Episode" ? { type: item.Type } : {}),
        mediaType: item.MediaType ?? undefined,
        isFolder: item.IsFolder ?? false,
      }));
    const request: ReceiverPlayRequest = {
      items,
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
        maxBitrate: bitrate,
      },
      request,
    );
    const message = notStartedMessage(deps, result);
    if (message) {
      writeErrorLog("The TV did not start the remote play", result);
      return failed(message);
    }
    if (result.outcome !== "loaded") return { status: "superseded" };
    if (send === sends) {
      deps.store.set(remotePlayAtom, {
        play,
        loaded: true,
        list: {
          itemIds: items.map(({ id }) => id),
          nextUpId: listed?.queue.nextUpId ?? null,
        },
      });
    }
    return { status: "loaded" };
  } catch (error) {
    logAndCaptureError("The remote play failed", error);
    return failed(deps.t("player.chromecast_playback_failed"));
  }
};

/**
 * The TV went on to `itemId`, another episode of the list the phone sent: the screen shows it in place, its tracks the
 * TV's, its next episode still what comes after the list, the tint shown kept until the new one is read. Nothing goes
 * to the TV. A send made meanwhile owns the screen.
 */
export const followOnRemote = async (
  deps: RemotePlayDeps,
  itemId: string,
  remote: RemoteTarget,
  state: RemotePlaybackState,
): Promise<void> => {
  const list = deps.store.get(remotePlayAtom)?.list;
  if (!list) return;
  // The tint the screen shows, when the newest send faded it in: carried, or the screen would go back to the neutral.
  const shown = shownTint?.send === sends ? shownTint.tint : null;
  const send = ++sends;
  if (shown) shownTint = { send, tint: shown };
  const { data: item } = await getLibraryApi(deps.api).getItem({
    itemId,
    userId: deps.userId,
  });
  const episodes = item.SeriesId
    ? await seriesEpisodes(deps.api, deps.userId, item.SeriesId).catch(
        (error) => {
          writeErrorLog("The series the TV plays could not be read", error);
          return [];
        },
      )
    : [];
  if (send !== sends) return;
  const play: ReceiverPlay = {
    item,
    positionTicks: secondsToTicks(state.positionSec),
    mediaSourceId: item.MediaSources?.[0]?.Id ?? undefined,
    audioIndex: state.audioIndex >= 0 ? state.audioIndex : undefined,
    subtitleIndex: state.subtitleIndex,
  };
  const config = configFor(
    deps,
    play,
    remote,
    remoteEpisodeList(deps.api, episodes, itemId),
    remoteNextUp(
      deps.api,
      episodes.find(({ id }) => id === list.nextUpId),
    ),
  );
  deps.store.set(remotePlayAtom, { play, loaded: true, list });
  await updateRemotePlayer({ ...config, tint: shown ?? config.tint });
  void followTint(config, send);
  showSegmentsLater(deps, config, play, remote, send);
};

/**
 * Shows an item of this server the TV plays, whoever sent it: the TV's list when the item is in it (the item alone
 * otherwise), what comes after its last item, the TV's tracks. In place when the screen is up, the tint shown kept
 * until the new one is read; opened on the neutral when it is not. A press after it goes under this phone's account.
 * Refused natively, the error is the caller's.
 */
export const showRemoteItem = async (
  deps: RemotePlayDeps,
  item: BaseItemDto,
  remote: RemoteTarget,
  state: RemotePlaybackState,
): Promise<void> => {
  const itemId = item.Id;
  if (!itemId) return;
  const shown = shownTint?.send === sends ? shownTint.tint : null;
  const send = ++sends;
  if (shown) shownTint = { send, tint: shown };
  const itemIds = state.queueItemIds.includes(itemId)
    ? [...state.queueItemIds]
    : [itemId];
  const episodes = item.SeriesId
    ? await seriesEpisodes(deps.api, deps.userId, item.SeriesId).catch(
        (error) => {
          writeErrorLog("The series the TV plays could not be read", error);
          return [];
        },
      )
    : [];
  if (send !== sends) return;
  const nextUp = episodeAfter(episodes, itemIds.at(-1) ?? null);
  const play: ReceiverPlay = {
    item,
    positionTicks: secondsToTicks(state.positionSec),
    mediaSourceId: item.MediaSources?.[0]?.Id ?? undefined,
    audioIndex: state.audioIndex >= 0 ? state.audioIndex : undefined,
    subtitleIndex: state.subtitleIndex,
  };
  const config = configFor(
    deps,
    play,
    remote,
    remoteEpisodeList(deps.api, episodes, itemId),
    remoteNextUp(deps.api, nextUp ?? undefined),
  );
  if (!(await updateRemotePlayer({ ...config, tint: shown ?? config.tint }))) {
    await presentRemotePlayer(config);
  }
  // Set once the screen took it: a refusal leaves what the store said.
  if (send !== sends) return;
  deps.store.set(remoteForeignAtom, null);
  deps.store.set(remotePlayAtom, {
    play,
    loaded: true,
    list: { itemIds, nextUpId: nextUp?.id ?? null },
  });
  void followTint(config, send);
  showSegmentsLater(deps, config, play, remote, send);
};

/**
 * Shows media this server does not know on the reduced player: the Cast status's title and image, the transport and
 * the TV. Nothing for Play here to continue, so no play is held. Refused natively, the error is the caller's.
 */
export const showForeignOnRemote = async (
  deps: RemotePlayDeps,
  media: {
    itemId: string | null;
    title: string | null;
    imageUrl: string | null;
  },
  remote: RemoteTarget,
): Promise<void> => {
  const send = ++sends;
  const config = buildReducedRemotePlayerConfig({
    title: media.title,
    imageUrl: media.imageUrl,
    targetName: remote.name,
    settings: deps.store.get(effectiveSettingsAtom),
    t: deps.t,
  });
  if (!(await updateRemotePlayer(config))) await presentRemotePlayer(config);
  if (send !== sends) return;
  deps.store.set(remotePlayAtom, null);
  deps.store.set(remoteForeignAtom, media);
  void followTint(config, send);
};
