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
  receiverNameFor,
  receiverPositionInItem,
  sendJellyfinCastCommand,
} from "@/utils/cast/jellyfinReceiver";
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
  queue: BaseItemDto[];
  startIndex: number;
  /** The play session on the receiver when the queue was sent: its status is the media being replaced. */
  replacedPlaySession: string | null;
}

interface UseMusicCastRemoteOptions {
  api: Api | null;
  userId: string | undefined;
  castConnected: boolean;
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
 * While a Cast session plays the queue the phone sent, the receiver is the
 * player: the music player shows what it plays and where, and its transport
 * drives it, so the phone stays silent.
 */
export const useMusicCastRemote = ({
  api,
  userId,
  castConnected,
  onHandBack,
}: UseMusicCastRemoteOptions) => {
  const client = useCastClient();
  const status = useCastMediaStatus();
  const receiverName = receiverNameFor(useCastDevice());
  const [sent, setSent] = useState<SentQueue | null>(null);
  const sentCount = useRef(0);

  const media = parseReceiverCustomData(status?.mediaInfo?.customData);
  // A status of the media the queue replaced says nothing about the queue yet.
  const fresh =
    sent !== null &&
    media.playSessionId !== null &&
    media.playSessionId !== sent.replacedPlaySession;
  const index =
    sent && fresh
      ? sent.queue.findIndex((item) => item.Id === media.itemId)
      : -1;

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
    fresh && !!status && status.playerState === CastMediaPlayerState.PLAYING;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setTick((tick) => tick + 1),
      MUSIC_CAST_PROGRESS_TICK_MS,
    );
    return () => clearInterval(timer);
  }, [playing]);

  let view: MusicCastRemoteView | null = null;
  if (castConnected && sent && (!fresh || index >= 0)) {
    const queueIndex = index >= 0 ? index : sent.startIndex;
    const currentTrack = sent.queue[queueIndex];
    const duration =
      (currentTrack?.RunTimeTicks ?? media.runtimeTicks ?? 0) /
      TICKS_PER_SECOND;
    const elapsed = playing
      ? ((Date.now() - statusAt) / 1000) * (status?.playbackRate || 1)
      : 0;
    const position =
      fresh && status
        ? receiverPositionInItem(status.streamPosition, media) + elapsed
        : 0;
    if (currentTrack) {
      view = {
        queue: sent.queue,
        queueIndex,
        currentTrack,
        // Until the receiver reports on the queue, it is loading it.
        isPlaying: fresh
          ? PLAYING_STATES.includes(status?.playerState ?? "")
          : true,
        progress: duration > 0 ? Math.min(position, duration) : position,
        duration,
      };
    }
  }

  // A film cast from its page, or another sender's media, replaced the queue.
  const replaced = castConnected && fresh && !!media.itemId && index < 0;
  useEffect(() => {
    if (replaced) setSent(null);
  }, [replaced]);

  // As on Spotify: when the session ends, the queue comes back to the phone,
  // paused where the receiver was.
  const lastView = useRef<MusicCastRemoteView | null>(null);
  if (castConnected) lastView.current = view;
  const handBack = useRef(onHandBack);
  handBack.current = onHandBack;
  useEffect(() => {
    if (castConnected) return;
    const last = lastView.current;
    lastView.current = null;
    setSent(null);
    if (last) handBack.current(last);
  }, [castConnected]);

  // What the receiver shows when a queue is sent is the media it replaces.
  const shownPlaySession = media.playSessionId;
  const begin = useCallback(
    (queue: BaseItemDto[], startIndex: number): number => {
      const id = ++sentCount.current;
      setSent({ id, queue, startIndex, replacedPlaySession: shownPlaySession });
      return id;
    },
    [shownPlaySession],
  );

  /** Lets go of the queue sent as `id`, unless a later one replaced it. */
  const end = useCallback((id: number) => {
    setSent((current) => (current?.id === id ? null : current));
  }, []);

  const session = useMemo<JellyfinCastSession | null>(
    () => (api && userId ? { api, userId, receiverName } : null),
    [api, userId, receiverName],
  );

  // A transport call that fails leaves the receiver as it was; the player
  // keeps showing what the receiver reports.
  const transport = useCallback(
    async (label: string, action: () => Promise<void> | undefined) => {
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
  const stop = useCallback(async () => {
    setSent(null);
    await transport("stop", () => client?.stop());
  }, [transport, client]);

  return { view, begin, end, pause, resume, next, previous, seek, stop };
};
