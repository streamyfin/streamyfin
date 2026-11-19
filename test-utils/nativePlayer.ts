/**
 * Double for the native `NativePlayer` module as `modules/mpv-player/src` uses it to present a player:
 * presentations are recorded in a state the test owns, and `addListener` keeps the listeners so a test can
 * fire native events with `emitNativePlayerEvent`, as the native side does, to every listener of the name.
 *
 * `jest.mock` factories run when the module under test is first imported, so the double reads the state
 * through a getter rather than capturing it:
 *
 *   jest.mock("@/modules/mpv-player/src/NativePlayerModule", () => ({
 *     __esModule: true,
 *     NativePlayerNativeModule: require("@/test-utils/nativePlayer").nativePlayerDoubleModule(() => mockPlayer),
 *   }));
 */
import type { NativePlayerEvents } from "@/modules/mpv-player/src/NativePlayerPresentation.types";

type Listener = (payload: unknown) => void;

export interface NativePlayerDoubleState {
  /** Configs handed to `presentPlayer`, in order. */
  presented: unknown[];
  /** Configs handed to `presentRemotePlayer`, in order. */
  remotePresented: unknown[];
  /** When set, `presentRemotePlayer` rejects with it, as a native refusal does. */
  remoteRefusal: Error | null;
  /** Tints handed to `updateRemotePlayerTint`, in order. */
  remoteTints: unknown[];
  /** Configs handed to `updateRemotePlayer`, in order. */
  remoteUpdates: unknown[];
  /** What `updateRemotePlayer` answers: false is no remote screen up. */
  remoteUpdateAnswer: boolean;
  /** Failures handed to `showRemotePlayerFailure`, in order, null for a clear. */
  remoteFailures: unknown[];
  /** Calls to `dismiss`, which closes whichever player is up. */
  dismissals: number;
  listeners: Map<string, Listener[]>;
}

export const createNativePlayerDoubleState = (): NativePlayerDoubleState => ({
  presented: [],
  remotePresented: [],
  remoteRefusal: null,
  remoteTints: [],
  remoteUpdates: [],
  remoteUpdateAnswer: true,
  remoteFailures: [],
  dismissals: 0,
  listeners: new Map(),
});

/** A native event, sent to every listener of its name with the body as the native side builds it. */
export const emitNativePlayerEvent = <K extends keyof NativePlayerEvents>(
  state: NativePlayerDoubleState,
  event: K,
  payload: Parameters<NativePlayerEvents[K]>[0] & { remote?: boolean },
): void => {
  for (const listener of [...(state.listeners.get(event) ?? [])])
    listener(payload);
};

export const nativePlayerDoubleModule = (
  state: () => NativePlayerDoubleState,
) => ({
  presentPlayer: jest.fn(async (config: unknown) => {
    state().presented.push(config);
  }),
  presentRemotePlayer: jest.fn(async (config: unknown) => {
    const refusal = state().remoteRefusal;
    if (refusal) throw refusal;
    state().remotePresented.push(config);
  }),
  updateRemotePlayerTint: jest.fn(async (tint: unknown) => {
    state().remoteTints.push(tint);
  }),
  updateRemotePlayer: jest.fn(async (config: unknown) => {
    state().remoteUpdates.push(config);
    return state().remoteUpdateAnswer;
  }),
  showRemotePlayerFailure: jest.fn(async (failure: unknown) => {
    state().remoteFailures.push(failure);
  }),
  dismiss: jest.fn(async () => {
    state().dismissals += 1;
  }),
  isPresented: jest.fn(() => false),
  addListener: jest.fn((event: string, listener: Listener) => {
    const listeners = state().listeners;
    listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    return {
      remove: () => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((held) => held !== listener),
        );
      },
    };
  }),
});
