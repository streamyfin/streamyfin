/** The slice of the native session an end-of-file event reads and writes. */
export type PlaybackEndedSession = {
  positionMs: number;
  awaitingLoad: boolean;
};

/**
 * Applies one native onPlaybackEnded event to the session and says whether it
 * was taken.
 *
 * beginSession points the session ref at the incoming session (awaitingLoad)
 * before its stream has loaded, while the outgoing stream keeps playing in
 * mpv. If that stream reaches end of file inside the window, the event
 * carries the outgoing stream's position; writing it onto the incoming
 * session would make the final progress and stop reports mark the new item
 * as stopped where the previous one ended. Every sibling listener already
 * drops events while awaitingLoad is set, so this one does too.
 */
export function applyPlaybackEnded(
  session: PlaybackEndedSession | null | undefined,
  positionSec: number,
): boolean {
  if (!session || session.awaitingLoad) return false;
  session.positionMs = positionSec * 1000;
  return true;
}
