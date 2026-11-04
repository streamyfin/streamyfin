/**
 * The JS face of the module's Cast support. The names follow what the app used
 * from react-native-google-cast, so the screens kept their vocabulary when the
 * library left; the values are the strings the native side emits.
 */

export const CastState = {
  NO_DEVICES_AVAILABLE: "noDevicesAvailable",
  NOT_CONNECTED: "notConnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
} as const;
export type CastStateValue = (typeof CastState)[keyof typeof CastState];

export const PlayServicesState = {
  SUCCESS: "success",
  MISSING: "missing",
  UPDATING: "updating",
  UPDATE_REQUIRED: "updateRequired",
  DISABLED: "disabled",
  INVALID: "invalid",
} as const;
export type PlayServicesStateValue =
  (typeof PlayServicesState)[keyof typeof PlayServicesState];

export const CastMediaPlayerState = {
  UNKNOWN: "unknown",
  IDLE: "idle",
  PLAYING: "playing",
  PAUSED: "paused",
  BUFFERING: "buffering",
  LOADING: "loading",
} as const;
export type CastMediaPlayerStateValue =
  (typeof CastMediaPlayerState)[keyof typeof CastMediaPlayerState];

export interface CastDevice {
  deviceId: string;
  friendlyName: string;
  modelName: string | null;
  /** False for a receiver without a screen: a speaker or a speaker group. */
  videoOut: boolean;
}

export interface CastSessionInfo {
  id: string;
  device: CastDevice | null;
}

export type CastSessionEvent =
  | "starting"
  | "started"
  | "startFailed"
  | "suspended"
  | "resuming"
  | "resumed"
  | "ending"
  | "ended";

export interface CastSessionEventPayload {
  event: CastSessionEvent;
  sessionId: string | null;
  /**
   * Why the session ended, or null when the user ended it: the module
   * reports no error only for a stop or a disconnect asked from this phone.
   */
  error: string | null;
  /**
   * True on an `ended` that a disconnect without stop brought: the TV still
   * plays when this session joined a receiver app already running, and has
   * closed when this session launched it. Absent otherwise, where an end
   * without an error closed the receiver app.
   */
  withoutStop?: boolean;
}

export interface CastMediaMetadata {
  title: string | null;
  subtitle: string | null;
}

export interface CastMediaInfo {
  contentId: string | null;
  /** What the receiver put on its media: item id, play session, play method. */
  customData: Record<string, unknown> | null;
  metadata: CastMediaMetadata | null;
}

export interface CastMediaStatus {
  playerState: CastMediaPlayerStateValue;
  currentItemId: number | null;
  streamPosition: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  mediaInfo: CastMediaInfo | null;
  customData: Record<string, unknown> | null;
}

export type ReceiverMessage = Record<string, unknown> | string;

export interface CastChannel {
  namespace: string;
  /** Whether the receiver had the namespace open when the channel was added. */
  connected: boolean;
  sendMessage(message: ReceiverMessage): Promise<void>;
  remove(): Promise<void>;
}

/** What a screen needs from the session it casts to. */
export interface CastClient {
  sessionId: string;
  getMediaStatus(): Promise<CastMediaStatus | null>;
  onMediaStatusUpdated(
    listener: (status: CastMediaStatus | null) => void,
  ): CastSubscription;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
}

export interface CastSubscription {
  remove(): void;
}

/** Where playback goes: nothing, a receiver being reached, a connected receiver, or one being left. */
export type RemoteTargetPhase = "none" | "connecting" | "connected" | "ending";

/** Only Cast targets exist so far; Play On and AirPlay come with their engines. */
export type RemoteTargetKind = "cast" | "playon" | "airplay" | "local";

export interface RemoteTarget {
  kind: RemoteTargetKind;
  /** The id discovery lists: CastDevice.deviceId for a Cast target. */
  id: string;
  name: string;
  capabilities: { volume: boolean };
}

/**
 * The target the module holds natively and publishes. JS reads it and asks for
 * a connection or a disconnection; the state itself only follows the SDK.
 */
export interface RemoteTargetState {
  state: RemoteTargetPhase;
  target: RemoteTarget | null;
  /** The SDK is reaching a session it lost, or one it resumes after a relaunch. */
  reconnecting: boolean;
  /**
   * Why the last session ended, or why a request the native side refused at once
   * left the target as it was; null when nothing went wrong, or when the user
   * ended the session.
   */
  error: string | null;
  /** The receiver's own volume, 0 to 1, as the SDK last reported it; null before it has, or with no target. */
  volume: number | null;
  /** The receiver is muted: the device, or on Android the playing stream, which is what the app mutes there. */
  muted: boolean;
  /** The SDK's status code for `error`: null with no error, and for a refusal of the native side's own. */
  errorCode: number | null;
  /** The receiver `error` belongs to, which may not be the target: a refused switch keeps the one that holds. */
  failedTarget: RemoteTarget | null;
}

export const NO_REMOTE_TARGET: RemoteTargetState = Object.freeze({
  state: "none",
  target: null,
  reconnecting: false,
  error: null,
  volume: null,
  muted: false,
  errorCode: null,
  failedTarget: null,
});

export type CastNativeEvents = {
  onCastStateChanged: (payload: { state: CastStateValue }) => void;
  onDevicesChanged: (payload: { devices: CastDevice[] }) => void;
  onSessionEvent: (payload: CastSessionEventPayload) => void;
  onMediaStatusChanged: (payload: { status: CastMediaStatus | null }) => void;
  /** The raw string the receiver sent; parsing is the caller's. */
  onReceiverMessage: (payload: { namespace: string; message: string }) => void;
  /**
   * Carries the new state, sent on each change only. A listener reads
   * remoteTarget() once, when it subscribes, for the state until the first event.
   */
  onRemoteTargetChanged: (payload: RemoteTargetState) => void;
};
