import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MUSIC_CAST_PROGRESS_TICK_MS,
  MUSIC_CAST_RESUME_END_MARGIN_SECONDS,
  MUSIC_CAST_START_FAILURE_WINDOW_MS,
  RECEIVER_NEXT_ITEM_WAIT_MS,
} from "@/constants/Cast";
import { PREVIOUS_RESTARTS_TRACK_AFTER_SECONDS } from "@/constants/Music";
import {
  CastIdleReason,
  CastMediaPlayerState,
  useCastClient,
  useCastDevice,
  useCastMediaStatus,
} from "@/modules/mpv-player/src/cast";
import {
  type JellyfinCastSession,
  parseReceiverCustomData,
  queueOnJellyfinReceiver,
  receiverNameFor,
  receiverPositionInItem,
  sendJellyfinCastCommand,
} from "@/utils/cast/jellyfinReceiver";
import {
  type MusicRepeatMode,
  toJellyfinRepeatMode,
} from "@/utils/jellyfin/playbackModes";
import { logAndCaptureError } from "@/utils/log";

/** What the music player shows while the receiver plays the queue it was sent. */
export interface MusicCastRemoteView {
  queue: BaseItemDto[];
  queueIndex: number;
  currentTrack: BaseItemDto;
  isPlaying: boolean;
  progress: number;
  duration: number;
}

interface SentQueue {
  id: number;
  /** The account that sent it. */
  owner: string | null;
  queue: BaseItemDto[];
  startIndex: number;
  /** Where the first track starts, in seconds. */
  startSeconds: number;
  /** The play session on the receiver when the queue was sent: its status is the media being replaced. */
  replacedPlaySession: string | null;
  /** What the receiver had before, put back if this cast does not start. */
  previous: SentQueue | null;
}

interface UseMusicCastRemoteOptions {
  api: Api | null;
  userId: string | undefined;
  /** The account the player belongs to: a queue another one sent is dropped. */
  ownerKey: string | null;
  /** Whether a Cast session is connected, whatever the phone's own network does. */
  connected: boolean;
  /** The mode the receiver plays the queue in: with a repeat, the last track goes on too. */
  repeatMode: MusicRepeatMode;
  /** The session ended while the receiver had the queue: where it was, for the phone to take it back. */
  onHandBack: (view: MusicCastRemoteView) => void;
}

const PLAYING_STATES: readonly string[] = [
  CastMediaPlayerState.PLAYING,
  CastMediaPlayerState.BUFFERING,
  CastMediaPlayerState.LOADING,
];

const TICKS_PER_SECOND = 10_000_000;

/**
 * Where an item the receiver reports sits in the queue. The status names the
 * item, not its place, so a track queued twice resolves to the copy at the
 * place last shown, else the next one after it, else the last one before.
 */
const placeOf = (
  queue: BaseItemDto[],
  itemId: string | null,
  near: number,
): number => {
  if (!itemId) return -1;
  if (queue[near]?.Id === itemId) return near;
  const after = queue.findIndex(
    (item, index) => index > near && item.Id === itemId,
  );
  if (after >= 0) return after;
  for (let index = Math.min(near, queue.length) - 1; index >= 0; index--) {
    if (queue[index].Id === itemId) return index;
  }
  return -1;
};

/**
 * While a Cast session plays the queue the phone sent, the receiver is the
 * player: the music player shows what it plays and where, and its transport
 * drives it, so the phone stays silent.
 */
export const useMusicCastRemote = ({
  api,
  userId,
  ownerKey,
  connected,
  repeatMode,
  onHandBack,
}: UseMusicCastRemoteOptions) => {
  const client = useCastClient();
  const status = useCastMediaStatus();
  const receiverName = receiverNameFor(useCastDevice());
  const [sent, setSent] = useState<SentQueue | null>(null);
  const sentCount = useRef(0);

  // A queue another account sent is not this account's to show or hand back.
  const current = sent && sent.owner === ownerKey ? sent : null;
  const media = parseReceiverCustomData(status?.mediaInfo?.customData);
  // A status of the media the queue replaced says nothing about the queue yet.
  const fresh =
    current !== null &&
    media.playSessionId !== null &&
    media.playSessionId !== current.replacedPlaySession;
  const shown = useRef<{ id: number; index: number } | null>(null);
  const near =
    current && shown.current?.id === current.id
      ? shown.current.index
      : (current?.startIndex ?? 0);
  const index =
    current && fresh ? placeOf(current.queue, media.itemId, near) : -1;
  if (current && index >= 0) shown.current = { id: current.id, index };
  const reported = fresh && index >= 0;

  // Once the receiver has played the queue, a status without it no longer
  // means the queue is loading. Media another sender loaded carries none of
  // the receiver's own data; no media at all is the queue gone with the
  // session still up.
  const reportedId = useRef<number | null>(null);
  if (current && reported) reportedId.current = current.id;
  const wasReported = current !== null && reportedId.current === current.id;
  const foreignMedia =
    wasReported && !!status?.mediaInfo && media.playSessionId === null;
  const gone = wasReported && !fresh && !foreignMedia;

  // The status gives the position only when something changes: in between,
  // the position counts on from it while the receiver plays.
  const statusSeen = useRef<{ status: typeof status; at: number }>({
    status: null,
    at: 0,
  });
  if (statusSeen.current.status !== status) {
    statusSeen.current = { status, at: Date.now() };
  }
  const statusAt = statusSeen.current.at;
  const [, setTick] = useState(0);

  // The receiver reports the track it finished as idle while it fetches the
  // next one, and a stream it reloads from a Seek as interrupted: the queue
  // goes on, as the native Cast engine reads it. Past the wait, from the first
  // such report on that track, the receiver is taken as stopped.
  const idleReason =
    reported && status?.playerState === CastMediaPlayerState.IDLE
      ? status.idleReason
      : undefined;
  const goesOn =
    current !== null &&
    (idleReason === CastIdleReason.INTERRUPTED ||
      (idleReason === CastIdleReason.FINISHED &&
        (repeatMode !== "off" || index < current.queue.length - 1)));
  const goingOnSince = useRef<{ id: number; index: number; at: number } | null>(
    null,
  );
  if (!current || !goesOn) goingOnSince.current = null;
  else if (
    goingOnSince.current?.id !== current.id ||
    goingOnSince.current.index !== index
  ) {
    goingOnSince.current = { id: current.id, index, at: statusAt };
  }
  const waitEndsAt =
    (goingOnSince.current?.at ?? 0) + RECEIVER_NEXT_ITEM_WAIT_MS;
  const goingOn = goesOn && Date.now() < waitEndsAt;
  useEffect(() => {
    if (!goingOn) return;
    // Renders once the wait is over, the status unchanged.
    const timer = setTimeout(
      () => setTick((tick) => tick + 1),
      waitEndsAt - Date.now(),
    );
    return () => clearTimeout(timer);
  }, [goingOn, waitEndsAt]);
  // Stopped from the TV's remote, or at the end of the queue, the receiver
  // reports the track it stopped on as idle: its media session is over, and a
  // play there does nothing until it is sent the queue again.
  const idle =
    reported && status?.playerState === CastMediaPlayerState.IDLE && !goingOn;
  const playing =
    reported && !!status && status.playerState === CastMediaPlayerState.PLAYING;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setTick((tick) => tick + 1),
      MUSIC_CAST_PROGRESS_TICK_MS,
    );
    return () => clearInterval(timer);
  }, [playing]);

  // Where the receiver last played the queue, as of that report: the status
  // of a stop reads 0, and the iOS SDK drops its media.
  const lastPlayed = useRef<{
    id: number;
    index: number;
    position: number;
    at: number;
    rate: number;
    duration: number;
  } | null>(null);
  if (
    current &&
    reported &&
    status &&
    status.playerState !== CastMediaPlayerState.IDLE
  ) {
    lastPlayed.current = {
      id: current.id,
      index,
      position: receiverPositionInItem(status.streamPosition, media),
      at: statusAt,
      rate: playing ? status.playbackRate || 1 : 0,
      duration:
        (current.queue[index]?.RunTimeTicks ?? media.runtimeTicks ?? 0) /
        TICKS_PER_SECOND,
    };
  }
  // An error soon after the receiver first reports on a queue is its failing
  // to start it.
  const firstReport = useRef<{ id: number; at: number } | null>(null);
  if (current && reported && firstReport.current?.id !== current.id) {
    firstReport.current = { id: current.id, at: statusAt };
  }

  // What the phone takes back when the session ends: the last place the
  // receiver reported, not a cast still loading.
  const lastView = useRef<MusicCastRemoteView | null>(null);

  let view: MusicCastRemoteView | null = null;
  if (connected && current && gone) {
    view = lastView.current ? { ...lastView.current, isPlaying: false } : null;
  } else if (connected && current && (!fresh || index >= 0)) {
    const queueIndex = index >= 0 ? index : current.startIndex;
    const currentTrack = current.queue[queueIndex];
    const duration =
      (currentTrack?.RunTimeTicks ?? media.runtimeTicks ?? 0) /
      TICKS_PER_SECOND;
    const elapsed = playing
      ? ((Date.now() - statusAt) / 1000) * (status?.playbackRate || 1)
      : 0;
    const position =
      reported && status
        ? receiverPositionInItem(status.streamPosition, media) + elapsed
        : 0;
    if (currentTrack) {
      view = {
        queue: current.queue,
        queueIndex,
        currentTrack,
        // Until the receiver reports on the queue, it is loading it.
        isPlaying: reported
          ? goingOn || PLAYING_STATES.includes(status?.playerState ?? "")
          : true,
        progress: duration > 0 ? Math.min(position, duration) : position,
        duration,
      };
    }
  }

  // Stopped, the player shows where play goes on from: where the receiver
  // stopped, or the top of the track once it ended or failed there.
  const stopped = view !== null && (gone || idle);
  const stopReason =
    stopped && status?.playerState === CastMediaPlayerState.IDLE
      ? status.idleReason
      : undefined;
  // When the receiver stopped: it sends its status again on a change of
  // volume, say, and the place it stopped on does not move on with it.
  const stoppedSince = useRef<{ id: number; at: number } | null>(null);
  if (!current || !stopped) stoppedSince.current = null;
  else if (stoppedSince.current?.id !== current.id) {
    stoppedSince.current = { id: current.id, at: statusAt };
  }
  const stoppedAt = stoppedSince.current?.at ?? statusAt;
  if (current && view && stopped) {
    let resumeAt = 0;
    const played = lastPlayed.current;
    if (
      stopReason !== CastIdleReason.FINISHED &&
      stopReason !== CastIdleReason.ERROR &&
      played?.id === current.id &&
      played.index === view.queueIndex
    ) {
      const at =
        played.position + ((stoppedAt - played.at) / 1000) * played.rate;
      // The status of a stop may not carry the duration.
      const duration = view.duration || played.duration;
      const nearEnd =
        duration > 0 && at >= duration - MUSIC_CAST_RESUME_END_MARGIN_SECONDS;
      resumeAt = nearEnd ? 0 : at;
    }
    view = { ...view, isPlaying: false, progress: resumeAt };
  }
  // Where the player shows the track, which Previous reads at the press.
  const shownProgress = useRef(0);
  shownProgress.current = view?.progress ?? 0;
  const first = firstReport.current;
  const failedStart =
    current !== null &&
    view !== null &&
    stopReason === CastIdleReason.ERROR &&
    current.startSeconds > 0 &&
    view.queueIndex === current.startIndex &&
    first?.id === current.id &&
    stoppedAt - first.at <= MUSIC_CAST_START_FAILURE_WINDOW_MS;

  if (connected && reported && view) lastView.current = view;

  // A film cast from its page, or another sender's media, replaced the queue;
  // or the account switched under it.
  const replaced =
    connected && ((fresh && !!media.itemId && index < 0) || foreignMedia);
  const foreign = sent !== null && sent.owner !== ownerKey;
  useEffect(() => {
    if (!replaced && !foreign) return;
    lastView.current = null;
    setSent(null);
  }, [replaced, foreign]);

  // As on Spotify: when the session ends, the queue comes back to the phone,
  // paused where the receiver was.
  const handBack = useRef(onHandBack);
  handBack.current = onHandBack;
  useEffect(() => {
    if (connected) return;
    const last = lastView.current;
    lastView.current = null;
    setSent(null);
    if (last) handBack.current(last);
  }, [connected]);

  // What the receiver shows when a queue is sent is the media it replaces.
  const shownPlaySession = media.playSessionId;
  const begin = useCallback(
    (queue: BaseItemDto[], startIndex: number, startSeconds = 0): number => {
      const id = ++sentCount.current;
      setSent((previous) => ({
        id,
        owner: ownerKey,
        queue,
        startIndex,
        startSeconds,
        replacedPlaySession: shownPlaySession,
        // One step back is enough: the queue the receiver had before this cast.
        previous: previous ? { ...previous, previous: null } : null,
      }));
      return id;
    },
    [ownerKey, shownPlaySession],
  );

  /** A cast that did not start: the receiver still has what it had before. */
  const end = useCallback((id: number) => {
    setSent((value) => (value?.id === id ? value.previous : value));
  }, []);

  const session = useMemo<JellyfinCastSession | null>(
    () => (api && userId ? { api, userId, receiverName } : null),
    [api, userId, receiverName],
  );

  // The controls act on the queue only once the receiver plays it: before,
  // they would pause or skip the media it is replacing.
  const reportedRef = useRef(reported);
  reportedRef.current = reported;
  // A transport call that fails leaves the receiver as it was; the player
  // keeps showing what the receiver reports. Resolves to what the call
  // returned, undefined when it did not run or failed.
  const transport = useCallback(
    async <T>(
      label: string,
      action: () => Promise<T> | undefined,
    ): Promise<T | undefined> => {
      if (!reportedRef.current) return undefined;
      try {
        return await action();
      } catch (error) {
        logAndCaptureError(`Cast music ${label} failed`, error);
        return undefined;
      }
    },
    [],
  );

  // A command waits for the channel to open, and the account can switch
  // meanwhile: every message carries credentials, and the receiver signs in
  // with the last ones it gets, so a command of the old account is not sent.
  const ownerKeyRef = useRef(ownerKey);
  ownerKeyRef.current = ownerKey;
  const staleOnSwitch = useCallback(() => {
    const owner = ownerKeyRef.current;
    return () => ownerKeyRef.current !== owner;
  }, []);
  const sentRef = useRef(sent);
  sentRef.current = sent;
  // The receiver already moves on: a Next or Previous then would move it once
  // more, so they wait for it, as the native Cast engine's do.
  const goingOnRef = useRef(goingOn);
  goingOnRef.current = goingOn;

  const pause = useCallback(
    () => transport("pause", () => client?.pause()),
    [transport, client],
  );
  const resume = useCallback(
    () => transport("play", () => client?.play()),
    [transport, client],
  );
  const next = useCallback(
    () =>
      transport("next", () =>
        session && !goingOnRef.current
          ? sendJellyfinCastCommand("NextTrack", session, {}, staleOnSwitch())
          : undefined,
      ),
    [transport, session, staleOnSwitch],
  );
  // A stream the receiver cannot seek in, transcoded music, is reloaded from
  // the new position, which only the receiver's own Seek does.
  const cannotSeekInStream = media.canClientSeek === false;
  const seek = useCallback(
    (position: number) =>
      transport<unknown>("seek", () =>
        cannotSeekInStream
          ? session
            ? sendJellyfinCastCommand(
                "Seek",
                session,
                { position },
                staleOnSwitch(),
              )
            : undefined
          : client?.seek(position),
      ),
    [transport, client, session, cannotSeekInStream, staleOnSwitch],
  );
  // The receiver never goes back to the start of the track it plays: its PreviousTrack goes to the one before, or
  // nowhere from the first. Past a few seconds in, Previous seeks to the start, as on the phone.
  const previous = useCallback(
    () =>
      shownProgress.current > PREVIOUS_RESTARTS_TRACK_AFTER_SECONDS
        ? seek(0)
        : transport("previous", () =>
            session && !goingOnRef.current
              ? sendJellyfinCastCommand(
                  "PreviousTrack",
                  session,
                  {},
                  staleOnSwitch(),
                )
              : undefined,
          ),
    [seek, transport, session, staleOnSwitch],
  );
  /** Resolves to whether the receiver was told: the player shows the mode only then. */
  const setRepeat = useCallback(
    async (mode: MusicRepeatMode): Promise<boolean> =>
      (await transport("repeat", () =>
        session
          ? sendJellyfinCastCommand(
              "SetRepeatMode",
              session,
              { RepeatMode: toJellyfinRepeatMode(mode) },
              staleOnSwitch(),
            )
          : undefined,
      )) === true,
    [transport, session, staleOnSwitch],
  );
  // The receiver appends both at the end of the queue it plays when the
  // message lands, and so does the queue the player shows: the tracks go to
  // the queue that was there when they were sent, not to a cast begun since.
  const enqueue = useCallback(
    (command: "PlayNext" | "PlayLast", items: BaseItemDto[]) =>
      transport("queue", async () => {
        if (!session || items.length === 0) return;
        const queueId = sentRef.current?.id;
        const queued = await queueOnJellyfinReceiver(
          command,
          session,
          items,
          staleOnSwitch(),
        );
        if (!queued) return;
        setSent((value) =>
          value && value.id === queueId
            ? { ...value, queue: [...value.queue, ...items] }
            : value,
        );
      }),
    [transport, session, staleOnSwitch],
  );
  const stop = useCallback(async () => {
    await transport("stop", () => client?.stop());
    lastView.current = null;
    setSent(null);
  }, [transport, client]);

  return {
    view,
    /** The receiver stopped the queue and plays nothing: play casts it again, from the view's position. */
    stopped,
    /**
     * The cast whose first track the receiver failed to start at its position,
     * a FLAC one on a Google TV Streamer: to send again from the top of the
     * track, once. Null otherwise.
     */
    failedStartId: failedStart && current ? current.id : null,
    /** The cast the receiver has played, from its first report on; null before. */
    reportedQueueId: wasReported && current ? current.id : null,
    begin,
    end,
    pause,
    resume,
    next,
    previous,
    seek,
    setRepeat,
    enqueue,
    stop,
  };
};
