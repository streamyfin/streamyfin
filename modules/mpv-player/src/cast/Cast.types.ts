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
   * Why the session ended, or null when the user ended it: the SDK reports
   * no error only for a stop asked from this phone, which also closes the
   * receiver app.
   */
  error: string | null;
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

export type CastNativeEvents = {
  onCastStateChanged: (payload: { state: CastStateValue }) => void;
  onDevicesChanged: (payload: { devices: CastDevice[] }) => void;
  onSessionEvent: (payload: CastSessionEventPayload) => void;
  onMediaStatusChanged: (payload: { status: CastMediaStatus | null }) => void;
  /** The raw string the receiver sent; parsing is the caller's. */
  onReceiverMessage: (payload: { namespace: string; message: string }) => void;
};
