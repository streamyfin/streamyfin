import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import GoogleCast, {
  CastChannel,
  MediaPlayerState,
  type MediaStatus,
  type RemoteMediaClient,
} from "react-native-google-cast";
import {
  RECEIVER_CHANNEL_OPEN_ATTEMPTS,
  RECEIVER_FALLBACK_ID_LENGTH,
  RECEIVER_FALLBACK_NAME,
} from "@/constants/Cast";

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
  /**
   * Device name shown in the Jellyfin dashboard; the receiver derives its
   * DeviceId from it. Build it with `receiverNameFor`.
   */
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

export type ReceiverMessage = Record<string, any> | string;

interface OpenChannel {
  /** The Cast session the receiver callbacks were registered on. */
  sessionId: string | undefined;
  channel: CastChannel;
}

let open: OpenChannel | null = null;
const listeners = new Set<(message: ReceiverMessage) => void>();

/**
 * The receiver sends JSON, but both native modules hand the payload to JS as
 * the raw string, so it arrives unparsed. An unparseable one is passed on as
 * it came.
 */
const parseReceiverMessage = (message: ReceiverMessage): ReceiverMessage => {
  if (typeof message !== "string") return message;

  try {
    return JSON.parse(message) as Record<string, unknown>;
  } catch {
    return message;
  }
};

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

const closeChannel = async (): Promise<void> => {
  const previous = open;
  open = null;
  // Its session may be gone already, which makes the native removal fail; the
  // listeners it holds are dropped by `remove()` either way.
  await previous?.channel.remove().catch(() => {});
};

let releasesOnSessionChange = false;

/**
 * The channel only hears the receiver through the native session object it was
 * registered on, and a session id does not identify that object: rejoining a
 * receiver that kept playing gives the same id, and Android rebuilds the Cast
 * client on a resume. Kept past those, the channel stops hearing the receiver
 * (Android) or cannot send at all (iOS), so it is dropped and the next command
 * opens a fresh one.
 */
const releaseChannelOnSessionChange = () => {
  if (releasesOnSessionChange) return;
  releasesOnSessionChange = true;

  const sessionManager = GoogleCast.getSessionManager();
  const release = () => {
    void closeChannel();
  };
  sessionManager.onSessionEnded(release);
  sessionManager.onSessionSuspended(release);
  sessionManager.onSessionResumed(release);
};

const openChannel = async (
  sessionId: string | undefined,
): Promise<CastChannel> => {
  releaseChannelOnSessionChange();
  await closeChannel();
  const channel = await CastChannel.add(JELLYFIN_CAST_NAMESPACE, (message) => {
    const parsed = parseReceiverMessage(message);
    for (const listener of listeners) listener(parsed);
  });

  if (!channel.connected) {
    await channel.remove().catch(() => {});
    throw new Error(
      `Jellyfin cast channel ${JELLYFIN_CAST_NAMESPACE} is not connected`,
    );
  }

  open = { sessionId, channel };

  return channel;
};

let opening: Promise<CastChannel> | null = null;

const getChannel = async (): Promise<CastChannel> => {
  for (let attempt = 0; attempt < RECEIVER_CHANNEL_OPEN_ATTEMPTS; attempt++) {
    const session =
      await GoogleCast.getSessionManager().getCurrentCastSession();

    // `connected` is not maintained on Android: the native module answers
    // `true` when the channel is created and never sends an update. So the
    // channel is keyed on the session whose receiver callbacks it registered,
    // and a new session gets a new channel rather than a stale one that hears
    // nothing.
    if (open && open.sessionId === session?.id) return open.channel;

    // Two commands sent at once (a cast started from two screens) would both
    // open a channel, and only the last one would be tracked, leaving the
    // other registered on the session with nothing able to remove it.
    opening ??= openChannel(session?.id).finally(() => {
      opening = null;
    });

    // The open may have been started for the session before this one, so the
    // loop reads the session again rather than trusting what the wait returns.
    await opening;
  }

  throw new Error(
    `Jellyfin cast channel ${JELLYFIN_CAST_NAMESPACE} could not be opened: the Cast session keeps changing`,
  );
};

/**
 * The receiver strips these characters from the name it is given before using
 * it as its Jellyfin device name, so compare against the same cleanup.
 */
export const toReceiverDeviceName = (receiverName: string): string =>
  receiverName.replace(/[^\w\s]/gi, "");

/** The parts of a Cast device the receiver's Jellyfin device name comes from. */
interface ReceiverDevice {
  friendlyName?: string | null;
  deviceId?: string | null;
}

/**
 * The name to hand the receiver as `receiverName`. The receiver keeps only
 * ASCII letters, digits, `_` and whitespace, then calls btoa() on what is left
 * to make its DeviceId, so two kinds of Cast name break it:
 * - whitespace above U+00FF (the ideographic space a Japanese keyboard types)
 *   survives the cleanup and makes btoa() throw, and the receiver then drops
 *   every message without a word back;
 * - a name with no ASCII letter or digit ("Гостиная", "客厅电视") cleans to
 *   nothing, and an empty DeviceId makes the server fold the TV into the
 *   phone's own device.
 * Any other name goes through unchanged, so the receiver names the TV as it
 * does for jellyfin-web.
 */
export const receiverNameFor = (
  device: ReceiverDevice | null | undefined,
): string | undefined => {
  if (!device) return undefined;

  const name = (device.friendlyName ?? "").replace(/\s/g, (space) =>
    space.charCodeAt(0) > 0xff ? " " : space,
  );
  if (toReceiverDeviceName(name).trim()) return name;

  // The end of the id is the part that differs between devices.
  const id = (device.deviceId ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(-RECEIVER_FALLBACK_ID_LENGTH);
  return id ? `${RECEIVER_FALLBACK_NAME} ${id}` : RECEIVER_FALLBACK_NAME;
};

/**
 * The name the receiver takes as its Jellyfin device name, read at send time.
 * `useCastDevice()` resolves it a render late, and a cast fired on the render
 * the session connects would otherwise send nothing: the receiver would then
 * name itself "Google Cast" and the stop reporter could not find its session.
 */
export const currentReceiverName = async (): Promise<string | undefined> => {
  const session = await GoogleCast.getSessionManager().getCurrentCastSession();

  return receiverNameFor(await session?.getCastDevice());
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

/**
 * A guide program is not playable itself and the receiver has no lookup from a
 * program to its channel, so it would ask PlaybackInfo for the program and
 * fail. jellyfin-web plays the program's channel instead, live, with none of
 * the program page's stream picks, and so does this.
 */
const toReceiverRequest = (
  request: JellyfinCastPlayRequest,
): JellyfinCastPlayRequest => {
  const [first] = request.items;
  if (request.items.length !== 1 || first?.Type !== "Program") return request;
  if (!first.ChannelId) return request;

  return {
    items: [
      {
        Id: first.ChannelId,
        Name: first.ChannelName ?? first.Name,
        Type: "TvChannel",
        MediaType: "Video",
        IsFolder: false,
      },
    ],
  };
};

export const playOnJellyfinReceiver = async (
  session: JellyfinCastSession,
  request: JellyfinCastPlayRequest,
): Promise<void> => {
  const { items, ...rest } = toReceiverRequest(request);

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

export type ReceiverLoadOutcome =
  | { status: "loaded" }
  | { status: "failed"; error: ReceiverLoadError; message: ReceiverMessage }
  | { status: "timed_out" }
  /** A newer cast replaced this one before it settled. */
  | { status: "superseded" };

/** The part of the receiver's media customData that tells its loads apart. */
interface ReceiverMediaData {
  itemId?: string;
  playSessionId?: string;
}

const receiverMediaData = (
  status: MediaStatus | null | undefined,
): ReceiverMediaData | undefined =>
  status?.mediaInfo?.customData as ReceiverMediaData | undefined;

let supersedeCurrentCast: (() => void) | null = null;
/** Counts casts, so that one a newer cast overtook can tell. */
let castCount = 0;

/**
 * Casts and resolves once the receiver has a media session for the requested
 * item, has sent a load error back, or has done neither within `timeoutMs`.
 *
 * Sending PlayNow only means the message left the phone. A receiver that
 * cannot reach the server fails on its first request without a word back, and
 * one that replaces playing media goes idle before loading the new item, which
 * closes Android's expanded controls if they were opened on the send.
 */
export const castToJellyfinReceiver = async (
  client: RemoteMediaClient,
  session: JellyfinCastSession,
  request: JellyfinCastPlayRequest,
  timeoutMs: number,
): Promise<ReceiverLoadOutcome> => {
  const cast = ++castCount;
  supersedeCurrentCast?.();

  const sent = toReceiverRequest(request);
  const itemId = sent.items[sent.startIndex ?? 0]?.Id;
  // Every load gets a new play session, which is what tells a recast of the
  // item already on the TV from the media it replaces.
  const previous = receiverMediaData(
    await client.getMediaStatus().catch(() => null),
  );
  // A cast started while this one read the media status owns the TV now:
  // sending this one after it would replace it there.
  if (cast !== castCount) return { status: "superseded" };

  return new Promise<ReceiverLoadOutcome>((resolve, reject) => {
    let settled = false;
    let stopWatchingErrors = () => {};
    let statusUpdates: { remove: () => void } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      statusUpdates?.remove();
      stopWatchingErrors();
      if (supersedeCurrentCast === supersede) supersedeCurrentCast = null;
      finish();
    };
    const supersede = () => settle(() => resolve({ status: "superseded" }));
    supersedeCurrentCast = supersede;

    stopWatchingErrors = watchReceiverLoadErrors(
      (error, message) =>
        settle(() => resolve({ status: "failed", error, message })),
      timeoutMs,
    );
    statusUpdates = client.onMediaStatusUpdated((status) => {
      const media = receiverMediaData(status);
      if (!media?.itemId || media.itemId !== itemId) return;
      if (
        previous?.playSessionId &&
        media.playSessionId === previous.playSessionId
      ) {
        return;
      }
      if (!status?.playerState || status.playerState === MediaPlayerState.IDLE)
        return;
      settle(() => resolve({ status: "loaded" }));
    });
    timer = setTimeout(
      () => settle(() => resolve({ status: "timed_out" })),
      timeoutMs,
    );

    playOnJellyfinReceiver(session, request).catch((error) =>
      settle(() => reject(error)),
    );
  });
};
