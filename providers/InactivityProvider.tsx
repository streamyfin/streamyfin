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
import { useJellyfin } from "@/providers/JellyfinProvider";
import { InactivityTimeout, useSettings } from "@/utils/atoms/settings";
import { storage } from "@/utils/mmkv";

const INACTIVITY_LAST_ACTIVITY_KEY = "INACTIVITY_LAST_ACTIVITY";

interface InactivityContextValue {
  resetInactivityTimer: () => void;
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
 * - Handles app backgrounding: logs out immediately if timeout exceeded while away
 * - No-op on mobile platforms
 */
export const InactivityProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { settings } = useSettings();
  const { logout } = useJellyfin();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const timeoutMs = settings.inactivityTimeout ?? InactivityTimeout.Disabled;
  const isEnabled = Platform.isTV && timeoutMs > 0;

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
      if (!isEnabled) return;

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
        // App returned to foreground - check if timeout exceeded
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
    if (isEnabled) {
      updateLastActivity();
      startTimer();
    }
  }, []);

  const contextValue: InactivityContextValue = {
    resetInactivityTimer,
  };

  return (
    <InactivityContext.Provider value={contextValue}>
      {children}
    </InactivityContext.Provider>
  );
};

/**
 * Hook to access the inactivity reset function.
 * Returns a no-op function if not within the provider (safe on mobile).
 */
export const useInactivity = (): InactivityContextValue => {
  const context = useContext(InactivityContext);

  // Return a no-op if not within provider (e.g., on mobile)
  if (!context) {
    return {
      resetInactivityTimer: () => {},
    };
  }

  return context;
};
