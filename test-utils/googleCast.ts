/**
 * Double for `react-native-google-cast` as `utils/cast/jellyfinReceiver.ts`
 * uses it: a session manager that answers the current session, and a
 * `CastChannel.add` that hands back a fake channel recording what was sent.
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

export interface CastDoubleState {
  sessionId: string | undefined;
  device: { friendlyName: string; deviceId: string } | null;
  channels: FakeCastChannel[];
  connectOnAdd: boolean;
}

export const createCastDoubleState = (): CastDoubleState => ({
  sessionId: "session-1",
  device: {
    friendlyName: "Living Room TV",
    deviceId: "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e",
  },
  channels: [],
  connectOnAdd: true,
});

export const lastCastChannel = (state: CastDoubleState): FakeCastChannel =>
  state.channels[state.channels.length - 1];

const noListener = () => ({ remove: () => {} });

export const castDoubleModule = (state: () => CastDoubleState) => ({
  __esModule: true,
  default: {
    getSessionManager: () => ({
      onSessionEnded: noListener,
      onSessionSuspended: noListener,
      onSessionResumed: noListener,
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
        const channel: FakeCastChannel = {
          connected: state().connectOnAdd,
          sendMessage: jest.fn(async () => {}),
          remove: jest.fn(async () => {}),
          receive: onMessage,
        };
        state().channels.push(channel);
        return channel;
      },
    ),
  },
});
