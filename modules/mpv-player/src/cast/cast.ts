import type {
  CastChannel,
  CastClient,
  CastDevice,
  CastMediaStatus,
  CastNativeEvents,
  CastSessionEventPayload,
  CastSessionInfo,
  CastStateValue,
  CastSubscription,
  PlayServicesStateValue,
  ReceiverMessage,
} from "./Cast.types";
import { CastNative, type CastNativeModule } from "./CastModule";

const UNAVAILABLE = "Cast is not available on this platform";

/** The module when it can cast, else null: every call below turns into a no-op. */
const native = (): CastNativeModule | null =>
  CastNative?.isAvailable() ? CastNative : null;

export const isCastAvailable = (): boolean => native() !== null;

export const castState = (): CastStateValue | null =>
  native()?.getCastState() ?? null;

export const playServicesState = (): PlayServicesStateValue | null =>
  native()?.getPlayServicesState() ?? null;

export const showPlayServicesErrorDialog = (
  state: PlayServicesStateValue,
): Promise<void> =>
  native()?.showPlayServicesErrorDialog(state) ?? Promise.resolve();

export const castDevices = (): CastDevice[] => native()?.getDevices() ?? [];

export const startCastDiscovery = (): Promise<void> =>
  native()?.startDiscovery() ?? Promise.resolve();

export const stopCastDiscovery = (): Promise<void> =>
  native()?.stopDiscovery() ?? Promise.resolve();

export const currentCastSession = (): CastSessionInfo | null =>
  native()?.getCurrentSession() ?? null;

export const showCastDialog = (): Promise<boolean> =>
  native()?.showCastDialog() ?? Promise.resolve(false);

export const showExpandedControls = (): Promise<boolean> =>
  native()?.showExpandedControls() ?? Promise.resolve(false);

type EventName = keyof CastNativeEvents;
type Listener<K extends EventName> = CastNativeEvents[K];

const listeners: { [K in EventName]: Set<Listener<K>> } = {
  onCastStateChanged: new Set(),
  onDevicesChanged: new Set(),
  onSessionEvent: new Set(),
  onMediaStatusChanged: new Set(),
  onReceiverMessage: new Set(),
};
const nativeSubscriptions: Partial<Record<EventName, CastSubscription>> = {};

/**
 * One native subscription per event, shared by every JS listener and released
 * with the last of them: the module only emits while something observes it,
 * and a listener dropped by one screen must not silence another.
 */
const subscribe = <K extends EventName>(
  event: K,
  listener: Listener<K>,
): CastSubscription => {
  const module = native();
  if (!module) return { remove() {} };

  const set = listeners[event] as Set<Listener<K>>;
  if (!nativeSubscriptions[event]) {
    nativeSubscriptions[event] = module.addListener(event, ((
      payload: Parameters<Listener<K>>[0],
    ) => {
      for (const current of [...set]) {
        (current as (value: typeof payload) => void)(payload);
      }
    }) as Listener<K>);
  }
  set.add(listener);

  return {
    remove() {
      set.delete(listener);
      if (set.size === 0) {
        nativeSubscriptions[event]?.remove();
        delete nativeSubscriptions[event];
      }
    },
  };
};

export const onCastStateChanged = (
  listener: (state: CastStateValue) => void,
): CastSubscription =>
  subscribe("onCastStateChanged", ({ state }) => listener(state));

export const onCastDevicesChanged = (
  listener: (devices: CastDevice[]) => void,
): CastSubscription =>
  subscribe("onDevicesChanged", ({ devices }) => listener(devices));

export const onCastSessionEvent = (
  listener: (payload: CastSessionEventPayload) => void,
): CastSubscription => subscribe("onSessionEvent", listener);

export const onCastMediaStatusChanged = (
  listener: (status: CastMediaStatus | null) => void,
): CastSubscription =>
  subscribe("onMediaStatusChanged", ({ status }) => listener(status));

/**
 * Opens a custom channel on the current session and hands every message the
 * receiver sends on it, as the raw string, to `onMessage`. `connected` says
 * whether the receiver had the namespace open at that moment; a channel on a
 * session that has since changed hears nothing, which is the caller's to track.
 */
export const addCastChannel = async (
  namespace: string,
  onMessage: (message: ReceiverMessage) => void,
): Promise<CastChannel> => {
  const module = native();
  if (!module) {
    return {
      namespace,
      connected: false,
      sendMessage: () => Promise.reject(new Error(UNAVAILABLE)),
      remove: () => Promise.resolve(),
    };
  }

  const info = await module.addChannel(namespace);
  const subscription = subscribe("onReceiverMessage", (payload) => {
    if (payload.namespace === namespace) onMessage(payload.message);
  });

  return {
    namespace,
    connected: info.connected,
    sendMessage: (message) =>
      module.sendMessage(
        namespace,
        typeof message === "string" ? message : JSON.stringify(message),
      ),
    remove: async () => {
      subscription.remove();
      await module.removeChannel(namespace);
    },
  };
};

/** The client of a session: media status and transport, nothing about discovery. */
export const castClientFor = (session: CastSessionInfo): CastClient => ({
  sessionId: session.id,
  getMediaStatus: () => native()?.getMediaStatus() ?? Promise.resolve(null),
  onMediaStatusUpdated: (listener) => onCastMediaStatusChanged(listener),
  play: () => native()?.play() ?? Promise.resolve(),
  pause: () => native()?.pause() ?? Promise.resolve(),
  stop: () => native()?.stop() ?? Promise.resolve(),
  seek: (positionSeconds) =>
    native()?.seek(positionSeconds) ?? Promise.resolve(),
});
