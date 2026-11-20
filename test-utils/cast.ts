/**
 * Double for the native `StreamyfinCast` module as `modules/mpv-player/src/cast`
 * uses it: every function is a `jest.fn` reading a state the test owns, and
 * `addListener` records the listeners so a test can fire native events with
 * `emitCastEvent`.
 *
 * `jest.mock` factories run when the module under test is first imported, so
 * the double reads the state through a getter rather than capturing it:
 *
 *   jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
 *     __esModule: true,
 *     CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
 *   }));
 */
import type {
  CastDevice,
  CastMediaStatus,
  CastNativeEvents,
  CastSessionEvent,
  CastSessionInfo,
  CastStateValue,
  PlayServicesStateValue,
} from "@/modules/mpv-player/src/cast/Cast.types";

/** One channel `addChannel` created; a send goes to the latest open one of its namespace. */
export interface CastDoubleChannel {
  namespace: string;
  connected: boolean;
  /** Messages sent on this channel, as the strings the native side receives. */
  sent: string[];
  removed: boolean;
}

export interface CastDoubleState {
  /** What `isAvailable()` answers: false on a TV or without Play Services. */
  available: boolean;
  castState: CastStateValue | null;
  playServicesState: PlayServicesStateValue | null;
  session: CastSessionInfo | null;
  devices: CastDevice[];
  mediaStatus: CastMediaStatus | null;
  /** Every channel `addChannel` created, in order. */
  channels: CastDoubleChannel[];
  /** Namespaces handed to `removeChannel`, in order. */
  removed: string[];
  /** Every message `sendMessage` received, in order. */
  sent: { namespace: string; message: string }[];
  /** Dialogs the module was asked to show, in order. */
  dialogs: string[];
  discoveryCalls: number;
  /** Whether a channel opened by `addChannel` reports itself connected. */
  connectOnAdd: boolean;
  /** When set, `addChannel` waits on it before creating the channel. */
  holdAdd: Promise<void> | null;
  /** When true, `addChannel` moves the session on, as a Cast session change would. */
  renewSessionOnAdd: boolean;
  /** Listeners registered through `addListener`, by event. */
  listeners: { [K in keyof CastNativeEvents]: CastNativeEvents[K][] };
}

export const CAST_DOUBLE_DEVICE_ID = "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e";

export const castDoubleDevice = (): CastDevice => ({
  deviceId: CAST_DOUBLE_DEVICE_ID,
  friendlyName: "Living Room TV",
  modelName: "Chromecast",
});

export const createCastDoubleState = (): CastDoubleState => ({
  available: true,
  castState: "connected",
  playServicesState: "success",
  session: { id: "session-1", device: castDoubleDevice() },
  devices: [],
  mediaStatus: null,
  channels: [],
  removed: [],
  sent: [],
  dialogs: [],
  discoveryCalls: 0,
  connectOnAdd: true,
  holdAdd: null,
  renewSessionOnAdd: false,
  listeners: {
    onCastStateChanged: [],
    onDevicesChanged: [],
    onSessionEvent: [],
    onMediaStatusChanged: [],
    onReceiverMessage: [],
  },
});

/** Moves the double onto a session; the device stays unless given (null for a session without one). */
export const setCastSession = (
  state: CastDoubleState,
  id: string | null,
  device?: CastDevice | null,
): void => {
  state.session =
    id === null
      ? null
      : {
          id,
          device:
            device === undefined
              ? (state.session?.device ?? castDoubleDevice())
              : device,
        };
};

export const lastCastChannel = (state: CastDoubleState): CastDoubleChannel =>
  state.channels[state.channels.length - 1];

const openChannel = (
  state: CastDoubleState,
  namespace: string,
): CastDoubleChannel | undefined =>
  [...state.channels]
    .reverse()
    .find((channel) => channel.namespace === namespace && !channel.removed);

/** What was sent on a channel, parsed back; a message that is not JSON stays a string. */
export const sentOn = (channel: CastDoubleChannel): unknown[] =>
  channel.sent.map((message) => {
    try {
      return JSON.parse(message) as unknown;
    } catch {
      return message;
    }
  });

/** Fires every listener registered for a native event, as the module would. */
export const emitCastEvent = <K extends keyof CastNativeEvents>(
  state: CastDoubleState,
  event: K,
  payload: Parameters<CastNativeEvents[K]>[0],
): void => {
  for (const listener of [...state.listeners[event]]) {
    (listener as (value: typeof payload) => void)(payload);
  }
};

/** A session event for the current session, as the native listeners report it. */
export const emitCastSessionEvent = (
  state: CastDoubleState,
  event: CastSessionEvent,
  error: string | null = null,
): void =>
  emitCastEvent(state, "onSessionEvent", {
    event,
    sessionId: state.session?.id ?? null,
    error,
  });

/** A receiver message on a channel's namespace; the native side only ever hands over strings. */
export const receiveOnChannel = (
  state: CastDoubleState,
  channel: CastDoubleChannel,
  message: string | Record<string, unknown>,
): void =>
  emitCastEvent(state, "onReceiverMessage", {
    namespace: channel.namespace,
    message: typeof message === "string" ? message : JSON.stringify(message),
  });

export const castDoubleModule = (state: () => CastDoubleState) => ({
  isAvailable: jest.fn(() => state().available),
  getCastState: jest.fn(() => state().castState),
  getPlayServicesState: jest.fn(() => state().playServicesState),
  showPlayServicesErrorDialog: jest.fn(async (value: string) => {
    state().dialogs.push(`playServices:${value}`);
  }),
  getDevices: jest.fn(() => state().devices),
  startDiscovery: jest.fn(async () => {
    state().discoveryCalls += 1;
  }),
  stopDiscovery: jest.fn(async () => {}),
  // A fresh object per call, as the native bridge hands one over.
  getCurrentSession: jest.fn(() => {
    const session = state().session;
    return session ? { ...session } : null;
  }),
  showCastDialog: jest.fn(async () => {
    state().dialogs.push("cast");
    return true;
  }),
  showExpandedControls: jest.fn(async () => {
    state().dialogs.push("expandedControls");
    return true;
  }),
  addChannel: jest.fn(async (namespace: string) => {
    const current = state();
    if (current.holdAdd) await current.holdAdd;
    if (current.renewSessionOnAdd && current.session) {
      current.session = {
        ...current.session,
        id: `${current.session.id}-renewed`,
      };
    }
    current.channels.push({
      namespace,
      connected: current.connectOnAdd,
      sent: [],
      removed: false,
    });
    return { namespace, connected: current.connectOnAdd };
  }),
  removeChannel: jest.fn(async (namespace: string) => {
    const current = state();
    const channel = openChannel(current, namespace);
    if (channel) channel.removed = true;
    current.removed.push(namespace);
  }),
  sendMessage: jest.fn(async (namespace: string, message: string) => {
    const current = state();
    current.sent.push({ namespace, message });
    openChannel(current, namespace)?.sent.push(message);
  }),
  // The native side acts only on the session a transport call names.
  getMediaStatus: jest.fn(async (sessionId?: string) =>
    sessionId && state().session?.id !== sessionId ? null : state().mediaStatus,
  ),
  play: jest.fn(async (_sessionId?: string) => {}),
  pause: jest.fn(async (_sessionId?: string) => {}),
  stop: jest.fn(async (_sessionId?: string) => {}),
  seek: jest.fn(async (_positionSeconds: number, _sessionId?: string) => {}),
  addListener: jest.fn(
    <K extends keyof CastNativeEvents>(
      event: K,
      listener: CastNativeEvents[K],
    ) => {
      state().listeners[event].push(listener);
      return {
        remove: () => {
          const list = state().listeners[event];
          const index = list.indexOf(listener);
          if (index >= 0) list.splice(index, 1);
        },
      };
    },
  ),
});
