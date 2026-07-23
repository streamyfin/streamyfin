import { getServerUrlCandidates } from "./candidates";
import type { ServerProbe, ServerProbeOutcome } from "./types";

export type ResolveFailureReason =
  | "empty"
  | "invalid"
  | "wrong-service"
  | "unreachable"
  /** The resolution was superseded or aborted; discard the result. */
  | "cancelled";

export type ResolveResult =
  | { ok: true; url: string; meta?: Record<string, unknown> }
  | { ok: false; reason: ResolveFailureReason };

export interface ResolveOptions {
  /** Per-candidate probe timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Abort the whole resolution (cancels every in-flight probe). */
  signal?: AbortSignal;
}

// Order in which to surface a failure when no candidate validated:
// the more specific/actionable the reason, the earlier it is reported.
const FAILURE_PRIORITY = [
  "wrong-service",
  "unreachable",
] as const satisfies ReadonlyArray<ResolveFailureReason>;

/**
 * Resolve loose user input to a single working, canonical server URL.
 *
 * Generates candidates (https-first), probes them in parallel with a per-candidate
 * timeout, and returns the first candidate (in preference order) the probe
 * accepted. When none work, the most actionable failure is returned.
 */
export async function resolveServerUrl(
  input: string,
  probe: ServerProbe,
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const { timeoutMs = 5000, signal } = options;

  if (!input.trim()) return { ok: false, reason: "empty" };
  if (signal?.aborted) return { ok: false, reason: "cancelled" };

  const candidates = getServerUrlCandidates(input);
  if (candidates.length === 0) return { ok: false, reason: "invalid" };

  // Launch every probe in parallel but await them in preference order
  // (https first): as soon as a preferred candidate validates, adopt it
  // without waiting for lower-priority probes still in flight (a blackholed
  // http fallback would otherwise add its full timeout to a successful
  // https resolution).
  const probes = candidates.map((url) =>
    runProbe(url, probe, timeoutMs, signal),
  );
  const outcomes: ServerProbeOutcome[] = [];
  for (let i = 0; i < probes.length; i++) {
    const outcome = await probes[i];
    if (outcome.status === "ok") {
      return { ok: true, url: candidates[i], meta: outcome.meta };
    }
    outcomes.push(outcome);
  }

  // An abort mid-flight surfaces as unreachable probes; report it for what
  // it is so callers discard the attempt instead of showing an error.
  if (signal?.aborted) return { ok: false, reason: "cancelled" };

  // Nothing validated: report the most useful failure.
  for (const reason of FAILURE_PRIORITY) {
    const hit = outcomes.find((outcome) => outcome.status === reason);
    if (hit) {
      return { ok: false, reason };
    }
  }
  return { ok: false, reason: "unreachable" };
}

async function runProbe(
  url: string,
  probe: ServerProbe,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<ServerProbeOutcome> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener("abort", abort);
  const timer = setTimeout(abort, timeoutMs);

  try {
    return await probe(url, controller.signal);
  } catch {
    return { status: "unreachable" };
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
  }
}
