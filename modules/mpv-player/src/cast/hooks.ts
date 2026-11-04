import { useEffect, useMemo, useState } from "react";
import type {
  CastClient,
  CastDevice,
  CastMediaStatus,
  CastSessionInfo,
  CastStateValue,
} from "./Cast.types";
import {
  castClientFor,
  castDevices,
  castState,
  currentCastSession,
  onCastDevicesChanged,
  onCastSessionEvent,
  onCastStateChanged,
} from "./cast";

export const useCastState = (): CastStateValue | null => {
  const [state, setState] = useState<CastStateValue | null>(() => castState());

  useEffect(() => {
    setState(castState());
    const subscription = onCastStateChanged(setState);
    return () => subscription.remove();
  }, []);

  return state;
};

/**
 * The current session, null while suspended: a suspended session cannot be
 * used until the SDK resumes it, and the screens treat the gap as a
 * disconnection, as they did with the library.
 */
export const useCastSession = (): CastSessionInfo | null => {
  const [session, setSession] = useState<CastSessionInfo | null>(() =>
    currentCastSession(),
  );

  useEffect(() => {
    // The native side builds a new object per read: the same session id keeps
    // the object the consumers already hold, so a client is made once per session.
    const read = () =>
      setSession((previous) => {
        const next = currentCastSession();
        return previous && next && previous.id === next.id ? previous : next;
      });
    const sessionEvents = onCastSessionEvent(({ event }) => {
      if (event === "started" || event === "resumed") {
        read();
      } else if (event === "suspended" || event === "ended") {
        setSession(null);
      }
    });
    // A session the SDK resumed before JS listened only shows in the state.
    const stateEvents = onCastStateChanged((state) => {
      if (state === "connected") read();
    });
    // Listeners first, then the read: a bootstrap finishing in between would be missed.
    read();
    return () => {
      sessionEvents.remove();
      stateEvents.remove();
    };
  }, []);

  return session;
};

export const useCastDevice = (): CastDevice | null =>
  useCastSession()?.device ?? null;

export const useCastDevices = (): CastDevice[] => {
  const [devices, setDevices] = useState<CastDevice[]>(() => castDevices());

  useEffect(() => {
    setDevices(castDevices());
    const subscription = onCastDevicesChanged(setDevices);
    return () => subscription.remove();
  }, []);

  return devices;
};

/** One client object per session object, so effects keyed on it run once per session. */
export const useCastClient = (): CastClient | null => {
  const session = useCastSession();

  return useMemo(() => (session ? castClientFor(session) : null), [session]);
};

export const useCastMediaStatus = (): CastMediaStatus | null => {
  const client = useCastClient();
  const [status, setStatus] = useState<CastMediaStatus | null>(null);

  useEffect(() => {
    if (!client) {
      setStatus(null);
      return;
    }
    let active = true;
    client.getMediaStatus().then((value) => {
      if (active) setStatus(value);
    });
    const subscription = client.onMediaStatusUpdated(setStatus);
    return () => {
      active = false;
      subscription.remove();
    };
  }, [client]);

  return status;
};
