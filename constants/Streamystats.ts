/**
 * How long a Streamystats watchlists request waits for the server, in
 * milliseconds, before the tab says the lists could not be loaded. Neither
 * axios nor the platforms give up on their own: a server that took the
 * connection and never answered kept the tab on its loader for good.
 */
export const STREAMYSTATS_REQUEST_TIMEOUT_MS = 15_000;
