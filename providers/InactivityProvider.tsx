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
import { useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import { InactivityTimeout, useSettings } from "@/utils/atoms/settings";
import { storage } from "@/utils/mmkv";

const INACTIVITY_LAST_ACTIVITY_KEY = "INACTIVITY_LAST_ACTIVITY";

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
  const signedIn = Boolean(useAtomValue(userAtom)?.Id);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isPausedRef = useRef(false);

  const timeoutMs = settings.inactivityTimeout ?? InactivityTimeout.Disabled;
  const isEnabled = Platform.isTV && timeoutMs > 0 && signedIn;

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
    if (!isEnabled || isPausedRef.current) return;

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
    if (!isEnabled) return;

    isPausedRef.current = false;
    updateLastActivity();
    startTimer();
  }, [isEnabled, updateLastActivity, startTimer]);

  // A sign-in starts the count afresh: the activity on record is from before
  // it, on the login screen or in an earlier session. Declared before the
  // effects that read it, so they see the new one. A session restored at
  // launch keeps its record, which is how a TV left alone while the app was
  // closed is signed out when it opens.
  const wasSignedInRef = useRef(signedIn);
  useEffect(() => {
    if (signedIn && !wasSignedInRef.current) updateLastActivity();
    wasSignedInRef.current = signedIn;
  }, [signedIn, updateLastActivity]);

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

  // Initialize timer when enabled or timeout changes
  useEffect(() => {
    if (!isEnabled) {
      clearTimer();
      return;
    }

    // Don't start timer if paused
    if (isPausedRef.current) return;

    // Check if we should logout based on last activity
    const lastActivity = getLastActivity();
    const elapsed = Date.now() - lastActivity;

    if (elapsed >= timeoutMs) {
      // Already timed out - logout
      logout();
      storage.remove(INACTIVITY_LAST_ACTIVITY_KEY);
    } else {
      // Start timer with remaining time
      const remainingMs = timeoutMs - elapsed;
      startTimer(remainingMs);
    }

    return () => {
      clearTimer();
    };
  }, [isEnabled, timeoutMs, getLastActivity, startTimer, clearTimer, logout]);

  // Reset activity on initial mount when enabled
  useEffect(() => {
    if (isEnabled && !isPausedRef.current) {
      updateLastActivity();
      startTimer();
    }
  }, []);

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
