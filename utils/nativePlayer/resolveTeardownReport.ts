import { resolveFinalPositionMs } from "./resolveFinalPositionMs";

/** The slice of the native session a teardown reads. */
export type TeardownSession = {
  committed: boolean;
  awaitingLoad: boolean;
  positionMs: number;
};

/**
 * The position (ms) the final progress and stop reports carry at teardown,
 * or null when the session reports nothing.
 *
 * A session that never committed never sent a start report. The engine is
 * swapped in place, so the outgoing stream can end or be closed in the hop
 * between the session ref moving to the incoming session and its stream
 * loading, and the onDismiss that follows carries the OUTGOING position:
 * reporting it would mark the incoming item as stopped where the previous
 * one ended. A committed session whose own onLoad has not arrived is in the
 * same hop: on both platforms present() and load() resolve before onLoad,
 * so the native position is still the outgoing stream's and the tracked
 * position is what the start report said.
 */
export function resolveTeardownReport(
  session: TeardownSession,
  finalPositionSec: number | undefined,
): number | null {
  if (!session.committed) return null;
  if (session.awaitingLoad) return session.positionMs;
  return resolveFinalPositionMs(session.positionMs, finalPositionSec);
}
