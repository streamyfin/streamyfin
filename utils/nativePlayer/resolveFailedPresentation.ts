/** What beginSession does after present() or load() rejected. */
export type FailedPresentationOutcome =
  | "closed"
  | "restore"
  | "player-gone"
  | "unpresented";

/**
 * "closed": the session ref no longer points at the failed session, because
 * an onDismiss tore it down or a newer request took the player; its
 * bookkeeping is done and touching the ref would undo the newer state.
 * "restore": an in-place swap failed with the player still up on the old
 * stream; point the ref back and dismiss so onDismiss closes it.
 * "player-gone": the swap failed because the player is already gone, and no
 * onDismiss can be relied on for this session (one may still be queued, but
 * dismiss() with nothing presented resolves silently); the ref has to be
 * cleared here, or every later play takes the replace path against no
 * player.
 * "unpresented": a first presentation never reached the screen.
 */
export function resolveFailedPresentation(input: {
  sessionIsCurrent: boolean;
  swapped: boolean;
  playerPresented: boolean;
}): FailedPresentationOutcome {
  if (!input.sessionIsCurrent) return "closed";
  if (!input.swapped) return "unpresented";
  return input.playerPresented ? "restore" : "player-gone";
}
