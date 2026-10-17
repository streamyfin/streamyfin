/** The slice of the native session the engine's onLoad writes. */
export type LoadEventSession = {
  stream: { url: string };
  awaitingLoad: boolean;
  isMuted: boolean;
  isPlaying: boolean;
  hasPlaybackStarted: boolean;
};

export type LoadEvent = { url?: string; muted?: boolean; isPlaying?: boolean };

/**
 * Applies the engine's onLoad if it names this session's stream, and says
 * whether it did: from then on the engine's events belong to this session.
 *
 * An in-place swap can deliver the outgoing stream's onLoad late. Taking it
 * would let that stream's progress ticks move this session's position, and its
 * play state would get them reported under the new item. Both platforms echo
 * the URL string the session asked for, so the strings are compared exactly. An event
 * without a URL is taken, as every onLoad was before.
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
): boolean {
  if (event.url && event.url !== session.stream.url) return false;
  session.awaitingLoad = false;
  if (typeof event.muted === "boolean") session.isMuted = event.muted;
  if (typeof event.isPlaying === "boolean") {
    session.isPlaying = event.isPlaying;
    if (event.isPlaying) session.hasPlaybackStarted = true;
  }
  return true;
}
