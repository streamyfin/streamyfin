import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { CastChannel } from "react-native-google-cast";

/**
 * The official Jellyfin receiver (F007D354) speaks its own protocol over this
 * channel instead of taking a plain media URL: we hand it the server address, a
 * token and the item ids, and it runs the PlaybackInfo negotiation itself. That
 * is also why it shows up in the Jellyfin dashboard — the receiver opens a real
 * session and reports progress, which the default Google receiver never does.
 */
export const JELLYFIN_CAST_NAMESPACE = "urn:x-cast:com.connectsdk";

export type JellyfinCastCommand =
  | "PlayNow"
  | "PlayNext"
  | "PlayLast"
  | "Seek"
  | "Stop"
  | "Pause"
  | "Unpause"
  | "SetAudioStreamIndex"
  | "SetSubtitleStreamIndex"
  | "SetRepeatMode"
  | "Shuffle"
  | "InstantMix"
  | "DisplayContent"
  | "Identify";

/**
 * The receiver only reads Id/Name/Type/MediaType/IsFolder off the items it is
 * handed and refetches everything else from the server, so send just those:
 * whole BaseItemDto objects would blow past the 64 KB Cast message limit on a
 * long queue.
 */
const slimItem = (item: BaseItemDto) => ({
  Id: item.Id,
  Name: item.Name,
  Type: item.Type,
  MediaType: item.MediaType,
  IsFolder: item.IsFolder ?? false,
});

export interface JellyfinCastSession {
  api: Api;
  userId: string;
  /** Device name shown in the Jellyfin dashboard; the receiver derives its DeviceId from it. */
  receiverName?: string;
  maxBitrate?: number;
}

export interface JellyfinCastPlayRequest {
  items: BaseItemDto[];
  startIndex?: number;
  startPositionTicks?: number;
  mediaSourceId?: string;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
}

type ReceiverMessage = Record<string, any> | string;

let channel: CastChannel | null = null;
const listeners = new Set<(message: ReceiverMessage) => void>();

/**
 * The receiver answers on the same channel it listens on, and that is the only
 * place it reports its own failures (a rejected message, an unreachable
 * server) -- without a listener those errors are lost and the cast just sits
 * on the idle screen.
 */
export const subscribeToJellyfinReceiverMessages = (
  listener: (message: ReceiverMessage) => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getChannel = async (): Promise<CastChannel> => {
  // A channel outlives a single command but dies with its session, so a cached
  // one has to be revalidated rather than trusted.
  if (!channel?.connected) {
    channel = await CastChannel.add(JELLYFIN_CAST_NAMESPACE, (message) => {
      for (const listener of listeners) listener(message);
    });
  }

  if (!channel.connected) {
    throw new Error(
      `Jellyfin cast channel ${JELLYFIN_CAST_NAMESPACE} is not connected`,
    );
  }

  return channel;
};

export const sendJellyfinCastCommand = async (
  command: JellyfinCastCommand,
  session: JellyfinCastSession,
  options: Record<string, unknown> = {},
): Promise<void> => {
  const target = await getChannel();

  // The receiver rejects any message missing command/serverAddress/accessToken,
  // and it re-reads the server info on every message, so they all carry it.
  await target.sendMessage({
    command,
    serverAddress: session.api.basePath,
    accessToken: session.api.accessToken,
    userId: session.userId,
    ...(session.receiverName ? { receiverName: session.receiverName } : {}),
    ...(session.maxBitrate ? { maxBitrate: session.maxBitrate } : {}),
    options,
  });
};

export const playOnJellyfinReceiver = async (
  session: JellyfinCastSession,
  request: JellyfinCastPlayRequest,
): Promise<void> => {
  const { items, ...rest } = request;

  await sendJellyfinCastCommand("PlayNow", session, {
    ...rest,
    items: items.map(slimItem),
  });
};

/**
 * Picks the part of a queue that fits in one PlayNow message while keeping the
 * selected item in it, and gives that item's index within the part. Cutting
 * the queue from the start instead dropped the selected track as soon as it
 * sat past the limit.
 */
export const queueWindow = <T>(
  queue: T[],
  selectedIndex: number,
  maxItems: number,
): { items: T[]; startIndex: number } => {
  const selected = Math.max(0, Math.min(selectedIndex, queue.length - 1));
  const start = Math.max(0, Math.min(selected, queue.length - maxItems));

  return {
    items: queue.slice(start, start + maxItems),
    startIndex: selected - start,
  };
};

export type ReceiverLoadError =
  | "server_unreachable"
  | "playback_failed"
  | "rejected";

const loadErrorOf = (message: ReceiverMessage): ReceiverLoadError | null => {
  const type = typeof message === "object" ? message?.type : undefined;
  if (type === "connectionerror") return "server_unreachable";
  if (type === "playbackerror") return "playback_failed";
  if (type === "error") return "rejected";
  return null;
};

let stopWatchingCurrentLoad: (() => void) | null = null;

/**
 * Calls `onError` with the first load error the receiver sends back within
 * `windowMs`, then stops listening. Only the latest cast command is watched:
 * starting a new watch ends the previous one, so a receiver error never shows
 * one alert per earlier attempt.
 *
 * Returns a function that stops watching, for a command that failed to send.
 */
export const watchReceiverLoadErrors = (
  onError: (error: ReceiverLoadError, message: ReceiverMessage) => void,
  windowMs: number,
): (() => void) => {
  stopWatchingCurrentLoad?.();

  let unsubscribe = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    clearTimeout(timer);
    unsubscribe();
    if (stopWatchingCurrentLoad === stop) stopWatchingCurrentLoad = null;
  };

  unsubscribe = subscribeToJellyfinReceiverMessages((message) => {
    const error = loadErrorOf(message);
    if (!error) return;
    stop();
    onError(error, message);
  });
  timer = setTimeout(stop, windowMs);
  stopWatchingCurrentLoad = stop;

  return stop;
};
