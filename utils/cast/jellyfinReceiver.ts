import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  RECEIVER_CHANNEL_OPEN_ATTEMPTS,
  RECEIVER_FALLBACK_ID_LENGTH,
  RECEIVER_FALLBACK_NAME,
  RECEIVER_UNCAPPED_BITRATE,
} from "@/constants/Cast";
import {
  addCastChannel,
  type CastChannel,
  type CastClient,
  CastMediaPlayerState,
  type CastMediaStatus,
  currentCastSession,
  onCastSessionEvent,
} from "@/modules/mpv-player/src/cast";

/**
 * The official Jellyfin receiver (F007D354) speaks its own protocol over this
 * channel instead of taking a plain media URL: we hand it the server address, a
 * token and the item ids, and it runs the PlaybackInfo negotiation itself. That
 * is also why it shows up in the Jellyfin dashboard — the receiver opens a real
 * session and reports progress, which the default Google receiver never does.
 */
export const JELLYFIN_CAST_NAMESPACE = "urn:x-cast:com.connectsdk";

/**
 * The commands the receiver acts on. Its volume commands (Mute, Unmute,
 * ToggleMute, SetVolume, VolumeUp, VolumeDown) are left out: the receiver only
 * logs them, and its volume goes through the Cast session's own.
 */
export type JellyfinCastCommand =
  | "PlayNow"
  // Appends to the receiver's queue exactly as PlayLast does, starts nothing
  // when nothing plays, and gets no answer.
  | "PlayNext"
  | "PlayLast"
  | "PlayPause"
  | "NextTrack"
  | "PreviousTrack"
  // Its options.position is in seconds.
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
  /**
   * Bitrate cap in bit/s; none sends `RECEIVER_UNCAPPED_BITRATE`. Every
   * message sets the cap the receiver's next loads use, so the commands that
   * follow a cast carry the cap it was started with.
   */
  maxBitrate?: number;
}

export interface JellyfinCastPlayRequest {
  /**
   * The media to play. A container among them is refused before anything is
   * sent: see `ReceiverContainerRefusedError`.
   */
  items: BaseItemDto[];
  startIndex?: number;
  startPositionTicks?: number;
  mediaSourceId?: string;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  /** A live stream already open, passed on to the receiver's PlaybackInfo. */
  liveStreamId?: string;
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
 * place it reports its own failures (a rejected message, a failed PlaybackInfo
 * request) -- without a listener those errors are lost and the cast just sits
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

  onCastSessionEvent(({ event }) => {
    if (event === "ended" || event === "suspended" || event === "resumed") {
      void closeChannel();
    }
  });
};

const openChannel = async (
  sessionId: string | undefined,
): Promise<CastChannel> => {
  releaseChannelOnSessionChange();
  await closeChannel();
  const channel = await addCastChannel(JELLYFIN_CAST_NAMESPACE, (message) => {
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
    const session = currentCastSession();

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
  return receiverNameFor(currentCastSession()?.device);
};

/**
 * The receiver turns a Seek position into ticks without rounding it, and when
 * it cannot seek in the stream it reloads it from there: a fraction of a
 * second then becomes a StartTimeTicks that is not a whole number, which the
 * server may reject. So the position goes out in whole seconds.
 */
const receiverOptions = (
  command: JellyfinCastCommand,
  options: Record<string, unknown>,
): Record<string, unknown> =>
  command === "Seek" && typeof options.position === "number"
    ? { ...options, position: Math.round(options.position) }
    : options;

export const sendJellyfinCastCommand = async (
  command: JellyfinCastCommand,
  session: JellyfinCastSession,
  options: Record<string, unknown> = {},
): Promise<void> => {
  const target = await getChannel();

  // The receiver rejects any message missing command/serverAddress/accessToken,
  // and it re-reads the server info on every message, so they all carry it.
  // It also keeps the last cap it was given until its app closes, so every
  // message states one: left out, the cap of an earlier cast would stay.
  await target.sendMessage({
    command,
    serverAddress: session.api.basePath,
    accessToken: session.api.accessToken,
    userId: session.userId,
    ...(session.receiverName ? { receiverName: session.receiverName } : {}),
    maxBitrate: session.maxBitrate || RECEIVER_UNCAPPED_BITRATE,
    options: receiverOptions(command, options),
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

/**
 * Handed one of these first, or any folder, the receiver plays children it
 * picks itself (a playlist's entries, an artist's or a genre's tracks, the
 * media under the folder) and drops the other items sent; one further down
 * the queue goes to its PlaybackInfo as it is, and fails there.
 */
const CONTAINER_TYPES = new Set(["Playlist", "MusicArtist", "MusicGenre"]);

const isContainer = (item: BaseItemDto): boolean =>
  CONTAINER_TYPES.has(item.Type ?? "") || !!item.IsFolder;

/**
 * A request holding a container, refused before anything is sent. The
 * receiver picks the child itself, and startIndex counts in its own list of
 * them, so no item id tells that load from the media the TV already plays.
 * Callers send the items to play instead, as music does with its tracks.
 */
export class ReceiverContainerRefusedError extends Error {
  constructor(item: BaseItemDto) {
    super(
      `Cannot cast ${item.Type ?? "item"} ${item.Id}: the receiver plays a container through children it picks, so cast its items instead`,
    );
    this.name = "ReceiverContainerRefusedError";
  }
}

const refuseContainers = (items: BaseItemDto[]): void => {
  const container = items.find(isContainer);
  if (container) throw new ReceiverContainerRefusedError(container);
};

export const playOnJellyfinReceiver = async (
  session: JellyfinCastSession,
  request: JellyfinCastPlayRequest,
): Promise<void> => {
  refuseContainers(request.items);
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

/**
 * What a load error the receiver sent back means:
 * - `playback_info_failed`: a connectionerror, its PlaybackInfo request
 *   failed (network, 401, 400, 500). It always comes before a playbackerror
 *   NoCompatibleStream, which only says that request came back empty. A
 *   server the receiver cannot reach at all fails an earlier request, and
 *   that one sends nothing.
 * - `playback_failed`: a playbackerror, carrying the PlaybackInfo error code
 *   (NotAllowed, NoCompatibleStream, RateLimitExceeded).
 * - `rejected`: an error, the receiver's answer to a message missing one of
 *   the fields it requires.
 */
export type ReceiverLoadError =
  | "playback_info_failed"
  | "playback_failed"
  | "rejected";

const loadErrorOf = (message: ReceiverMessage): ReceiverLoadError | null => {
  const type = typeof message === "object" ? message?.type : undefined;
  if (type === "connectionerror") return "playback_info_failed";
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

/**
 * What the receiver puts in its media customData. It writes the same keys on
 * every load, but a status for media another sender loaded has none, so each
 * field is read as optional.
 */
export interface ReceiverCustomData {
  itemId: string | null;
  playSessionId: string | null;
  audioStreamIndex: number | null;
  subtitleStreamIndex: number | null;
  mediaSourceId: string | null;
  playMethod: string | null;
  runtimeTicks: number | null;
  startPositionTicks: number | null;
  canSeek: boolean | null;
  /**
   * Whether the receiver seeks in the stream itself. When it cannot, a Seek
   * reloads the stream from the new position, and the status's currentTime
   * counts from the position the stream was loaded at: see
   * `receiverPositionInItem`.
   */
  canClientSeek: boolean | null;
  liveStreamId: string | null;
}

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const numberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Reads the receiver's media customData. The receiver writes numbers as
 * numbers, but a value forwarded through a native bridge may arrive as a
 * string, so numeric fields are parsed rather than typed.
 */
export const parseReceiverCustomData = (
  customData: unknown,
): ReceiverCustomData => {
  const data =
    typeof customData === "object" && customData !== null
      ? (customData as Record<string, unknown>)
      : {};

  return {
    itemId: stringOrNull(data.itemId),
    playSessionId: stringOrNull(data.playSessionId),
    audioStreamIndex: numberOrNull(data.audioStreamIndex),
    subtitleStreamIndex: numberOrNull(data.subtitleStreamIndex),
    mediaSourceId: stringOrNull(data.mediaSourceId),
    playMethod: stringOrNull(data.playMethod),
    runtimeTicks: numberOrNull(data.runtimeTicks),
    startPositionTicks: numberOrNull(data.startPositionTicks),
    canSeek: typeof data.canSeek === "boolean" ? data.canSeek : null,
    canClientSeek:
      typeof data.canClientSeek === "boolean" ? data.canClientSeek : null,
    liveStreamId: stringOrNull(data.liveStreamId),
  };
};

const TICKS_PER_SECOND = 10_000_000;

/**
 * Where the receiver is in the item, in seconds, from the currentTime of its
 * media status (`streamPosition` on ours). A stream the receiver seeks in
 * itself runs on the item's clock. One it cannot, transcoded music or live
 * TV, runs from the position it was loaded at, so that start is added back.
 */
export const receiverPositionInItem = (
  currentTime: number,
  customData: ReceiverCustomData,
): number =>
  customData.canClientSeek === false
    ? currentTime + (customData.startPositionTicks ?? 0) / TICKS_PER_SECOND
    : currentTime;

const receiverMediaData = (
  status: CastMediaStatus | null | undefined,
): ReceiverMediaData | undefined => {
  if (!status?.mediaInfo?.customData) return undefined;
  const data = parseReceiverCustomData(status.mediaInfo.customData);
  return {
    itemId: data.itemId ?? undefined,
    playSessionId: data.playSessionId ?? undefined,
  };
};

let supersedeCurrentCast: (() => void) | null = null;
/** Counts casts, so that one a newer cast overtook can tell. */
let castCount = 0;

/**
 * Casts and resolves once the receiver has a media session for the requested
 * item, has sent a load error back, or has done neither within `timeoutMs`.
 * A request holding a container is refused before anything is sent.
 *
 * Sending PlayNow only means the message left the phone. A receiver that
 * cannot reach the server fails on its first request without a word back, and
 * one that replaces playing media goes idle before loading the new item, which
 * closes Android's expanded controls if they were opened on the send.
 */
export const castToJellyfinReceiver = async (
  client: CastClient,
  session: JellyfinCastSession,
  request: JellyfinCastPlayRequest,
  timeoutMs: number,
): Promise<ReceiverLoadOutcome> => {
  // Refused before it counts as a cast: nothing reaches the TV, so the cast
  // still loading there is not replaced.
  refuseContainers(request.items);
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

  const isThisLoad = (status: CastMediaStatus | null): boolean => {
    const media = receiverMediaData(status);
    if (!media || !status?.playerState) return false;
    if (
      previous?.playSessionId &&
      media.playSessionId === previous.playSessionId
    ) {
      return false;
    }
    return (
      !!itemId &&
      media.itemId === itemId &&
      status.playerState !== CastMediaPlayerState.IDLE
    );
  };

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
      if (isThisLoad(status)) settle(() => resolve({ status: "loaded" }));
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
