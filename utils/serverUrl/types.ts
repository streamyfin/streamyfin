/** Result of probing a single candidate URL for a specific service. */
export type ServerProbeOutcome =
  | { status: "ok"; meta?: Record<string, unknown> }
  | { status: "wrong-service" }
  | { status: "unreachable" };

/**
 * Validates one fully-qualified candidate URL for a given service.
 * Implementations must resolve (never reject) — map errors to "unreachable".
 * The provided signal is aborted on timeout or cancellation.
 */
export type ServerProbe = (
  url: string,
  signal: AbortSignal,
) => Promise<ServerProbeOutcome>;
