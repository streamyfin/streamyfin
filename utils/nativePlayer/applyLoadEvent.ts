/** The slice of the native session the engine's onLoad writes. */
export type LoadEventSession = {
  awaitingLoad: boolean;
  isMuted: boolean;
  isPlaying: boolean;
  hasPlaybackStarted: boolean;
};

export type LoadEvent = { muted?: boolean; isPlaying?: boolean };

/**
 * Applies the engine's onLoad: from here on its events belong to this session.
 *
 * Mute and the play state ride along because both otherwise reach JS only as
 * transitions. A stream swapped in while the player plays never pauses or
 * resumes, so without the play state the new session would never count as
 * started and would send no progress report at all, seeks and track changes
 * included.
 */
export function applyLoadEvent(
  session: LoadEventSession,
  event: LoadEvent,
): void {
  session.awaitingLoad = false;
  if (typeof event.muted === "boolean") session.isMuted = event.muted;
  if (typeof event.isPlaying === "boolean") {
    session.isPlaying = event.isPlaying;
    if (event.isPlaying) session.hasPlaybackStarted = true;
  }
}
