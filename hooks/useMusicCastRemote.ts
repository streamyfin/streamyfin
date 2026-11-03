import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MUSIC_CAST_PROGRESS_TICK_MS } from "@/constants/Cast";
import {
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

  let view: MusicCastRemoteView | null = null;
  if (connected && current && (!fresh || index >= 0)) {
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
          ? PLAYING_STATES.includes(status?.playerState ?? "")
          : true,
        progress: duration > 0 ? Math.min(position, duration) : position,
        duration,
      };
    }
  }

  // What the phone takes back when the session ends: the last place the
  // receiver reported, not a cast still loading.
  const lastView = useRef<MusicCastRemoteView | null>(null);
  if (connected && reported && view) lastView.current = view;

  // A film cast from its page, or another sender's media, replaced the queue;
  // or the account switched under it.
  const replaced = connected && fresh && !!media.itemId && index < 0;
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
    (queue: BaseItemDto[], startIndex: number): number => {
      const id = ++sentCount.current;
      setSent((previous) => ({
        id,
        owner: ownerKey,
        queue,
        startIndex,
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
  // keeps showing what the receiver reports.
  const transport = useCallback(
    async (label: string, action: () => Promise<unknown> | undefined) => {
      if (!reportedRef.current) return;
      try {
        await action();
      } catch (error) {
        logAndCaptureError(`Cast music ${label} failed`, error);
      }
    },
    [],
  );

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
        session ? sendJellyfinCastCommand("NextTrack", session) : undefined,
      ),
    [transport, session],
  );
  const previous = useCallback(
    () =>
      transport("previous", () =>
        session ? sendJellyfinCastCommand("PreviousTrack", session) : undefined,
      ),
    [transport, session],
  );
  // A stream the receiver cannot seek in, transcoded music, is reloaded from
  // the new position, which only the receiver's own Seek does.
  const cannotSeekInStream = media.canClientSeek === false;
  const seek = useCallback(
    (position: number) =>
      transport("seek", () =>
        cannotSeekInStream
          ? session
            ? sendJellyfinCastCommand("Seek", session, { position })
            : undefined
          : client?.seek(position),
      ),
    [transport, client, session, cannotSeekInStream],
  );
  const setRepeat = useCallback(
    (mode: MusicRepeatMode) =>
      transport("repeat", () =>
        session
          ? sendJellyfinCastCommand("SetRepeatMode", session, {
              RepeatMode: toJellyfinRepeatMode(mode),
            })
          : undefined,
      ),
    [transport, session],
  );
  // The receiver appends both at the end of its queue, and so does the queue
  // the player shows.
  const enqueue = useCallback(
    (command: "PlayNext" | "PlayLast", items: BaseItemDto[]) =>
      transport("queue", async () => {
        if (!session || items.length === 0) return;
        await queueOnJellyfinReceiver(command, session, items);
        setSent((value) =>
          value ? { ...value, queue: [...value.queue, ...items] } : value,
        );
      }),
    [transport, session],
  );
  const stop = useCallback(async () => {
    await transport("stop", () => client?.stop());
    lastView.current = null;
    setSent(null);
  }, [transport, client]);

  return {
    view,
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
