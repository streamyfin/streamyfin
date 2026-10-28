/**
 * Double for `react-native-google-cast` as `utils/cast/jellyfinReceiver.ts`
 * uses it: a session manager that answers the current session and records
 * the session listeners, and a `CastChannel.add` that hands back a fake
 * channel recording what was sent.
 *
 * `jest.mock` factories run when the module under test is first imported, so
 * the double reads the state through a getter rather than capturing it.
 */
export interface FakeCastChannel {
  connected: boolean;
  sendMessage: jest.Mock;
  remove: jest.Mock;
  /** Delivers a receiver message to the listener the channel was opened with. */
  receive: (message: unknown) => void;
}

export type CastSessionEvent = "ended" | "suspended" | "resumed";

export interface CastDoubleState {
  sessionId: string | undefined;
  device: { friendlyName: string; deviceId: string } | null;
  channels: FakeCastChannel[];
  /** Whether a channel opened by `CastChannel.add` reports itself connected. */
  connectOnAdd: boolean;
  /** When set, `CastChannel.add` waits on it before creating the channel. */
  holdAdd: Promise<void> | null;
  /** When true, `CastChannel.add` moves the session on, as a Cast session change would. */
  renewSessionOnAdd: boolean;
  /** Listeners registered on the session manager, by event. */
  sessionListeners: Record<CastSessionEvent, (() => void)[]>;
}

export const CAST_DOUBLE_DEVICE_ID = "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e";

export const createCastDoubleState = (): CastDoubleState => ({
  sessionId: "session-1",
  device: { friendlyName: "Living Room TV", deviceId: CAST_DOUBLE_DEVICE_ID },
  channels: [],
  connectOnAdd: true,
  holdAdd: null,
  renewSessionOnAdd: false,
  sessionListeners: { ended: [], suspended: [], resumed: [] },
});

export const lastCastChannel = (state: CastDoubleState): FakeCastChannel =>
  state.channels[state.channels.length - 1];

/** Fires every listener registered for a session event; an unknown name fires nothing. */
export const fireCastSessionEvent = (
  state: CastDoubleState,
  event: CastSessionEvent | string,
): void => {
  for (const handler of state.sessionListeners[event as CastSessionEvent] ?? [])
    handler();
};

export const castDoubleModule = (state: () => CastDoubleState) => {
  const listen = (event: CastSessionEvent) => (handler: () => void) => {
    state().sessionListeners[event].push(handler);
    return { remove: () => {} };
  };

  return {
    __esModule: true,
    default: {
      getSessionManager: () => ({
        onSessionEnded: listen("ended"),
        onSessionSuspended: listen("suspended"),
        onSessionResumed: listen("resumed"),
        getCurrentCastSession: async () => {
          const current = state();
          return current.sessionId === undefined
            ? null
            : {
                id: current.sessionId,
                getCastDevice: async () => current.device,
              };
        },
      }),
    },
    MediaPlayerState: {
      IDLE: "idle",
      LOADING: "loading",
      BUFFERING: "buffering",
      PLAYING: "playing",
      PAUSED: "paused",
    },
    CastChannel: {
      add: jest.fn(
        async (_namespace: string, onMessage: (message: unknown) => void) => {
          const current = state();
          if (current.holdAdd) await current.holdAdd;
          if (current.renewSessionOnAdd)
            current.sessionId = `${current.sessionId}-renewed`;
          const channel: FakeCastChannel = {
            connected: current.connectOnAdd,
            sendMessage: jest.fn(async () => {}),
            remove: jest.fn(async () => {}),
            receive: onMessage,
          };
          current.channels.push(channel);
          return channel;
        },
      ),
    },
  };
};
