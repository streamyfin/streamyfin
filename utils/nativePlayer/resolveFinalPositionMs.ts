/**
 * Final playback position to report when the native player tears down.
 *
 * Two readings of the same position arrive at that moment. `trackedMs` is
 * what the session has accumulated from onProgress: seeded with the position
 * playback actually starts at, advanced on every tick, and moved synchronously
 * by a seek — every seek, since the native transport commands route through
 * the view model on both platforms rather than straight to the engine.
 * `finalPositionSec` is the view model's authoritative position attached to
 * onDismiss: seeded from the same start position, written by the same ticks
 * and the same seeks, and never by the display clock or a scrub. In every
 * reachable state it is the value `trackedMs` already holds, or the target of
 * a seek made since.
 *
 * Taking the later of the two is therefore a floor, not a reconciliation. The
 * exit-after-pause bug was a native value reading 0 — an unseeded engine cache
 * on iOS, a tick delivered after the renderer had stopped on Android — and
 * both are closed at the source, so onDismiss cannot carry 0 after the first
 * tick today; the max keeps a repeat of either off the server. An auto-skip
 * fired from inside a progress tick used to be the one live divergence — the
 * enclosing tick reported the pre-skip position after the skip's seek had
 * moved the native position — but the segment check now runs after the emit
 * on both platforms, so the skip's own tick lands last and the two converge
 * there too. No reachable state makes them differ; the max also covers the
 * segment check drifting back in front of the emit. Sub-second interpolation
 * stays on the display clock and is not reported.
 *
 * Both inputs are treated as untrusted: they arrive as native event payloads.
 * Math.max propagates a NaN, and msToTicks turns NaN into 0 — the reported
 * bug by another route — while an Infinity passes through it to the server.
 */
export function resolveFinalPositionMs(
  trackedMs: number,
  finalPositionSec: number | undefined,
): number {
  const tracked = Number.isFinite(trackedMs) ? Math.max(0, trackedMs) : 0;
  // The undefined arm is what narrows the type here; Number.isFinite is not a
  // type guard, so dropping it would only trade the check for a cast.
  if (finalPositionSec === undefined || !Number.isFinite(finalPositionSec)) {
    return tracked;
  }
  return Math.max(tracked, finalPositionSec * 1000);
}
