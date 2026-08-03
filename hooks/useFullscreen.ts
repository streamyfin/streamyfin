import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

/**
 * The bridge the Electron preload exposes. Absent when the web build is opened
 * in an ordinary browser, which is why every call below has a DOM fallback.
 */
interface DesktopFullscreenBridge {
  toggle: () => Promise<boolean>;
  get: () => Promise<boolean>;
  subscribe: (listener: (isFullscreen: boolean) => void) => () => void;
}

function desktopBridge(): DesktopFullscreenBridge | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const desktop = (
    window as unknown as {
      streamyfinDesktop?: { fullscreen?: DesktopFullscreenBridge };
    }
  ).streamyfinDesktop;
  return desktop?.fullscreen ?? null;
}

function domFullscreenAvailable() {
  return (
    Platform.OS === "web" &&
    typeof document !== "undefined" &&
    document.fullscreenEnabled === true
  );
}

/**
 * Fullscreen for the desktop and web builds.
 *
 * Prefers Electron's window fullscreen, so the player's button and the F11
 * accelerator stay in agreement, and falls back to the DOM Fullscreen API in a
 * plain browser. `isSupported` is false on native, where the player is already
 * fullscreen and the control should not appear at all.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isSupported = desktopBridge() !== null || domFullscreenAvailable();

  useEffect(() => {
    const bridge = desktopBridge();
    if (bridge) {
      let cancelled = false;
      void bridge.get().then((value) => {
        if (!cancelled) setIsFullscreen(value);
      });
      const unsubscribe = bridge.subscribe(setIsFullscreen);
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    if (!domFullscreenAvailable()) return;
    const sync = () => setIsFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = useCallback(async () => {
    const bridge = desktopBridge();
    if (bridge) {
      // The window's enter/leave events drive the state, so nothing to set here.
      await bridge.toggle();
      return;
    }
    if (!domFullscreenAvailable()) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Chromium rejects the request outside a user gesture. Nothing to do but
      // leave the player as it was.
    }
  }, []);

  return { isSupported, isFullscreen, toggle };
}

export default useFullscreen;
