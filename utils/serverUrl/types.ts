/** Result of probing a single candidate URL for a specific service. */
export type ServerProbeOutcome =
  | { status: "ok"; meta?: Record<string, unknown> }
  | { status: "wrong-service" }
  | { status: "unreachable" };

/**
 * Validates one fully-qualified candidate URL for a given service.
 * Implementations must resolve (never reject) — map errors to "unreachable".
 * The provided signal is aborted on timeout or cancellation.
 *
 * `headers` carries the custom proxy auth headers configured for the service;
 * without them a server behind an access gateway answers 403 and would look
 * like the wrong service.
 */
export type ServerProbe = (
  url: string,
  signal: AbortSignal,
  headers?: Record<string, string>,
) => Promise<ServerProbeOutcome>;
