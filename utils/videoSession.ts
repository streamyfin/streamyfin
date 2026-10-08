import { useEffect } from "react";

// How many video players are on screen. A count and not a flag: the page
// player and the native one can overlap for a moment while one hands over to
// the other, and the first to leave must not clear it for both.
let openSessions = 0;

/**
 * Marks a video player as on screen until the returned function is called.
 * Calling it more than once is harmless.
 */
export const enterVideoSession = (): (() => void) => {
  openSessions += 1;
  let left = false;
  return () => {
    if (left) return;
    left = true;
    openSessions -= 1;
  };
};

/**
 * Whether a video is what the app is playing. The server knows one session
 * for the whole app, so a remote control's command arrives at every player:
 * this is how the music player tells that one is not meant for it.
 *
 * Module state, read when a command arrives: nothing renders from it.
 */
export const isVideoSessionOpen = (): boolean => openSessions > 0;

/** Holds a video session open for as long as `active` and the caller live. */
export const useVideoSession = (active = true) => {
  useEffect(() => (active ? enterVideoSession() : undefined), [active]);
};
