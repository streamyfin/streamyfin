import { useEffect, useRef } from "react";
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

/** False on native, where the player already fills the screen. */
export function isFullscreenSupported() {
  return desktopBridge() !== null || domFullscreenAvailable();
}

export async function isFullscreen(): Promise<boolean> {
  const bridge = desktopBridge();
  if (bridge) return bridge.get();
  return domFullscreenAvailable() && document.fullscreenElement !== null;
}

/**
 * Electron's window fullscreen is preferred over the DOM Fullscreen API so this
 * agrees with the F11 accelerator, and because the DOM call is rejected outside
 * a user gesture — which would make entering fullscreen on open impossible.
 */
export async function setFullscreen(next: boolean): Promise<void> {
  const bridge = desktopBridge();
  if (bridge) {
    if ((await bridge.get()) !== next) await bridge.toggle();
    return;
  }
  if (!domFullscreenAvailable()) return;
  try {
    if (next) await document.documentElement.requestFullscreen();
    else if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // In a plain browser this needs a user gesture. Nothing to do but leave the
    // window as it was.
  }
}

/**
 * Hold the desktop window in fullscreen for as long as the player is open.
 *
 * Pass `suspended` while picture-in-picture is active: playback moves to its
 * own floating window then, and a fullscreen window left behind it is just a
 * black rectangle covering the screen. Fullscreen comes back when PiP ends.
 *
 * On the way out it only undoes what it did, so a window the user had already
 * put in fullscreen is left that way. No-op on native.
 */
export function usePlayerFullscreen(suspended = false) {
  const enteredByUs = useRef(false);

  useEffect(() => {
    if (!isFullscreenSupported()) return;

    if (suspended) {
      void setFullscreen(false);
      return;
    }

    let cancelled = false;
    void isFullscreen().then((wasFullscreen) => {
      if (cancelled || wasFullscreen) return;
      enteredByUs.current = true;
      void setFullscreen(true);
    });

    return () => {
      cancelled = true;
    };
  }, [suspended]);

  // Separate from the effect above so leaving PiP does not count as leaving the
  // player: this runs only when the screen itself goes away.
  useEffect(
    () => () => {
      if (enteredByUs.current) void setFullscreen(false);
    },
    [],
  );
}

export default usePlayerFullscreen;
