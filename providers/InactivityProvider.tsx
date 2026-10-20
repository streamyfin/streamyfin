import { useAtomValue } from "jotai";
import type React from "react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { INACTIVITY_LAST_ACTIVITY_STORAGE_KEY as INACTIVITY_LAST_ACTIVITY_KEY } from "@/constants/Inactivity";
import { useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import {
  InactivityTimeout,
  settingsAtom,
  useSettings,
} from "@/utils/atoms/settings";
import { storage } from "@/utils/mmkv";

interface InactivityContextValue {
  resetInactivityTimer: () => void;
  pauseInactivityTimer: () => void;
  resumeInactivityTimer: () => void;
}

const InactivityContext = createContext<InactivityContextValue | undefined>(
  undefined,
);

/**
 * TV-only provider that tracks user inactivity and auto-logs out
 * when the configured timeout is exceeded.
 *
 * Features:
 * - Tracks last activity timestamp (persisted to MMKV)
 * - Resets timer on any focus change (via resetInactivityTimer)
 * - Pauses timer during video playback (via pauseInactivityTimer/resumeInactivityTimer)
 * - Handles app backgrounding: logs out immediately if timeout exceeded while away
 * - Only counts while a user is signed in, from the sign-in on
 * - Measures a session restored at launch from its last activity
 * - No-op on mobile platforms
 */
export const InactivityProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { settings } = useSettings();
  const { logout } = useJellyfin();
  // Only a signed-in user can be signed out. On the login screen the sign-out
  // tore down the server the form was signing in to, and the next Log in
  // threw "API not initialized" (REACT-NATIVE-104).
  const userId = useAtomValue(userAtom)?.Id;
  // The local settings load after the first render; until then the timeout
  // is not known, only a plugin lock restored with the session.
  const settingsLoaded = useAtomValue(settingsAtom) !== null;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isPausedRef = useRef(false);
  // The user whose activity the record holds.
  const countedUserRef = useRef(userId);
  // The session restored at launch keeps its record until the timeout is
  // known, and is then measured from it once.
  const launchCheckRef = useRef(Boolean(userId));
  const wasEnabledRef = useRef(false);

  const timeoutMs = settings.inactivityTimeout ?? InactivityTimeout.Disabled;
  const isEnabled = Platform.isTV && timeoutMs > 0 && Boolean(userId);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const updateLastActivity = useCallback(() => {
    if (!isEnabled) return;
    storage.set(INACTIVITY_LAST_ACTIVITY_KEY, Date.now());
  }, [isEnabled]);

  const getLastActivity = useCallback((): number => {
    return storage.getNumber(INACTIVITY_LAST_ACTIVITY_KEY) ?? Date.now();
  }, []);

  const startTimer = useCallback(
    (remainingMs?: number) => {
      if (!isEnabled || isPausedRef.current) return;

      clearTimer();

      const delay = remainingMs ?? timeoutMs;
      timerRef.current = setTimeout(() => {
        logout();
        storage.remove(INACTIVITY_LAST_ACTIVITY_KEY);
      }, delay);
    },
    [isEnabled, timeoutMs, clearTimer, logout],
  );

  const resetInactivityTimer = useCallback(() => {
    // Before the launch check, a focus would hide how long the TV was left.
    if (!isEnabled || isPausedRef.current || launchCheckRef.current) return;

    updateLastActivity();
    startTimer();
  }, [isEnabled, updateLastActivity, startTimer]);

  const pauseInactivityTimer = useCallback(() => {
    if (!isEnabled) return;

    isPausedRef.current = true;
    clearTimer();
    // Update last activity so when we resume, we start fresh
    updateLastActivity();
  }, [isEnabled, clearTimer, updateLastActivity]);

  const resumeInactivityTimer = useCallback(() => {
    // Whatever happened meanwhile, the video no longer holds the count.
    isPausedRef.current = false;
    if (!isEnabled) return;

    updateLastActivity();
    startTimer();
  }, [isEnabled, updateLastActivity, startTimer]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    if (!isEnabled) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const wasBackground =
        appStateRef.current === "background" ||
        appStateRef.current === "inactive";
      const isNowActive = nextAppState === "active";

      if (wasBackground && isNowActive) {
        // App returned to foreground
        // If paused (e.g., video playing), don't check timeout
        if (isPausedRef.current) {
          appStateRef.current = nextAppState;
          return;
        }

        // Check if timeout exceeded
        const lastActivity = getLastActivity();
        const elapsed = Date.now() - lastActivity;

        if (elapsed >= timeoutMs) {
          // Timeout exceeded while backgrounded - logout immediately
          logout();
          storage.remove(INACTIVITY_LAST_ACTIVITY_KEY);
        } else {
          // Restart timer with remaining time
          const remainingMs = timeoutMs - elapsed;
          startTimer(remainingMs);
        }
      } else if (nextAppState === "background" || nextAppState === "inactive") {
        // App going to background - clear timer (time continues via timestamp)
        clearTimer();
      }

      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [isEnabled, timeoutMs, getLastActivity, startTimer, clearTimer, logout]);

  // The one place that decides when a count starts, and arms the timer.
  useEffect(() => {
    if (!Platform.isTV) return;

    if (!userId) {
      // Signed out: nothing is counted until the next sign-in, and a video
      // that was playing no longer holds the count.
      countedUserRef.current = undefined;
      launchCheckRef.current = false;
      wasEnabledRef.current = false;
      isPausedRef.current = false;
      clearTimer();
      storage.remove(INACTIVITY_LAST_ACTIVITY_KEY);
      return;
    }

    if (userId !== countedUserRef.current) {
      // A sign-in, or a switch to another user, starts a new count whatever
      // the timeout is now: one set right after, by the plugin's lock or in
      // Settings, is measured from here and not from an earlier session.
      countedUserRef.current = userId;
      launchCheckRef.current = false;
      isPausedRef.current = false;
      storage.set(INACTIVITY_LAST_ACTIVITY_KEY, Date.now());
    }

    if (!settingsLoaded) return;
    const enabled = timeoutMs > 0;
    const turnedOn = enabled && !wasEnabledRef.current;
    wasEnabledRef.current = enabled;
    const atLaunch = launchCheckRef.current;
    launchCheckRef.current = false;

    if (!enabled) {
      clearTimer();
      return;
    }
    if (isPausedRef.current) return;

    // Turned on during a session: counted from now, not from an activity
    // recorded while it was off. At launch the record stands, which is how a
    // TV left alone while the app was closed is signed out when it opens.
    // Without a record (a first launch, or one a sign-out removed) the count
    // starts now too, so a return to the foreground has a start to measure.
    if (
      (turnedOn && !atLaunch) ||
      storage.getNumber(INACTIVITY_LAST_ACTIVITY_KEY) === undefined
    ) {
      storage.set(INACTIVITY_LAST_ACTIVITY_KEY, Date.now());
    }

    const elapsed = Date.now() - getLastActivity();
    if (elapsed >= timeoutMs) {
      logout();
      storage.remove(INACTIVITY_LAST_ACTIVITY_KEY);
      return;
    }
    startTimer(timeoutMs - elapsed);

    return () => {
      clearTimer();
    };
  }, [
    userId,
    settingsLoaded,
    timeoutMs,
    getLastActivity,
    startTimer,
    clearTimer,
    logout,
  ]);

  const contextValue: InactivityContextValue = {
    resetInactivityTimer,
    pauseInactivityTimer,
    resumeInactivityTimer,
  };

  return (
    <InactivityContext.Provider value={contextValue}>
      {children}
    </InactivityContext.Provider>
  );
};

/**
 * Hook to access the inactivity timer controls.
 * Returns no-op functions if not within the provider (safe on mobile).
 */
export const useInactivity = (): InactivityContextValue => {
  const context = useContext(InactivityContext);

  // Return no-ops if not within provider (e.g., on mobile)
  if (!context) {
    return {
      resetInactivityTimer: () => {},
      pauseInactivityTimer: () => {},
      resumeInactivityTimer: () => {},
    };
  }

  return context;
};
