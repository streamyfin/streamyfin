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
 *     CastNative: require("@/test-utils/cast").castDoubleModule(() => state),
 *   }));
 */
import type {
  CastDevice,
  CastMediaStatus,
  CastNativeEvents,
  CastSessionInfo,
  CastStateValue,
  PlayServicesStateValue,
} from "@/modules/mpv-player/src/cast/Cast.types";

export interface CastDoubleChannel {
  namespace: string;
  connected: boolean;
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

export const lastCastChannel = (state: CastDoubleState): CastDoubleChannel =>
  state.channels[state.channels.length - 1];

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
  getCurrentSession: jest.fn(() => state().session),
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
    const channel = { namespace, connected: current.connectOnAdd };
    current.channels.push(channel);
    return channel;
  }),
  removeChannel: jest.fn(async (namespace: string) => {
    state().removed.push(namespace);
  }),
  sendMessage: jest.fn(async (namespace: string, message: string) => {
    state().sent.push({ namespace, message });
  }),
  getMediaStatus: jest.fn(async () => state().mediaStatus),
  play: jest.fn(async () => {}),
  pause: jest.fn(async () => {}),
  stop: jest.fn(async () => {}),
  seek: jest.fn(async (_positionSeconds: number) => {}),
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
