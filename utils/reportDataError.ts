import * as Sentry from "@sentry/react-native";
import { onlineManager } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { MAX_SESSION_REPORT_KEYS } from "@/constants/Sentry";
import {
  describeHttpError,
  describeHttpResponse,
  type HttpErrorDescription,
  isAbortLikeError,
  isEnvironmentError,
  isErrorReported,
  isExpectedError,
  isStaleIdError,
  markErrorReported,
} from "@/utils/errors";
import { admitHttpFailure } from "@/utils/httpFailureGate";
import { writeToLog } from "@/utils/log";

// Every React Query failure funnels through here instead of needing per-call
// handlers. Skipped: anything while offline, aborted requests, the user's
// environment — no HTTP response, a gateway error or a gateway's own refusal,
// axios or fetch — (an unreachable server is not an app bug), what a call site
// marked as an expected outcome or already reported itself, and 401s (session
// expiry has its own interceptor in JellyfinProvider). So is an id the server
// no longer has, a library renamed or deleted, which reportDataError writes
// to the local log instead.
export const shouldReportDataError = (error: unknown): boolean => {
  if (!onlineManager.isOnline()) return false;
  if (isExpectedError(error) || isErrorReported(error)) return false;
  if (isAbortLikeError(error) || isEnvironmentError(error)) return false;
  if (isStaleIdError(error)) return false;
  if (isAxiosError(error) && error.response?.status === 401) return false;
  return true;
};

// A persistently failing query refetches on every mount (staleTime 0), and
// Sentry's Dedupe integration only drops an event identical to the
// immediately-previous one — two alternating failing queries defeat it. HTTP
// failures are deduped by route and status in utils/httpFailureGate, shared
// with logAndCaptureError; this set covers the rest, one report per (source,
// key, error name) per session.
const reportedDataErrors = new Set<string>();

// A library renamed while the app was closed fails every query built from the
// cached list, on every screen that mounts one, so the log says it once per
// session per (source, query, method, route).
const loggedStaleIds = new Set<string>();

// The log can be exported and attached to a public issue, so the line names
// the query and gives the request's route as templated and its status: never
// the url, the id or the body.
const logStaleId = (
  source: "query" | "mutation",
  name: string | undefined,
  http: HttpErrorDescription,
) => {
  const dedupeKey = [source, name ?? "?", http.method, http.path].join("|");
  if (loggedStaleIds.has(dedupeKey)) return;
  // Past the cap a new key is logged without being remembered: the session
  // loses the dedupe, not the lines, as MAX_SESSION_REPORT_KEYS sets for
  // reports.
  if (loggedStaleIds.size < MAX_SESSION_REPORT_KEYS) {
    loggedStaleIds.add(dedupeKey);
  }
  writeToLog("WARN", "Asked for an id the server no longer has", {
    source,
    key: name,
    method: http.method,
    route: http.path,
    status: http.status,
  });
};

/** The QueryCache and MutationCache `onError` of the app's query client. */
export const reportDataError = (
  source: "query" | "mutation",
  key: readonly unknown[] | undefined,
  error: unknown,
) => {
  // Only the key's first element (the query's name) is used — later
  // elements can carry search text or item titles, and the name alone
  // already says which data path failed.
  const name = typeof key?.[0] === "string" ? key[0] : undefined;
  const http = describeHttpError(error);
  // Never reported (isStaleIdError), but not left without a trace either.
  if (http && isStaleIdError(error)) {
    logStaleId(source, name, http);
    return;
  }
  if (!shouldReportDataError(error)) return;
  // A 404 from a Streamystats endpoint is a server that predates the route
  // (recommendations, watchlists) — feature-unsupported, not an app bug, and
  // the UI already renders nothing for it.
  if (name === "streamystats" && http?.status === 404) return;
  // Decided here, once: a caller that catches the same error after the cache
  // has seen it (mutateAsync in a try/catch) must not send it a second time.
  markErrorReported(error);
  if (http) {
    if (admitHttpFailure(error) !== "report") return;
  } else {
    const dedupeKey = [
      source,
      name ?? "?",
      error instanceof Error ? error.name : typeof error,
    ].join("|");
    if (reportedDataErrors.has(dedupeKey)) return;
    if (reportedDataErrors.size < MAX_SESSION_REPORT_KEYS) {
      reportedDataErrors.add(dedupeKey);
    }
  }
  Sentry.withScope((scope) => {
    scope.setContext("data_layer", {
      source,
      key: name,
      keyLength: key?.length,
    });
    if (http) {
      // An AxiosError's stack has no app frames (it is built inside axios),
      // so left to Sentry every HTTP failure in the app lands in ONE issue.
      // Group by the query that failed, its route and the status instead.
      scope.setContext("http", http);
      // Who answered and in what shape: the route and the status alone do
      // not tell a parameter the server rejected from a proxy's own page.
      scope.setContext("http_response", describeHttpResponse(error) ?? null);
      scope.setFingerprint([
        "data-layer",
        source,
        name ?? "?",
        http.method,
        http.path,
        String(http.status),
      ]);
    }
    Sentry.captureException(error);
  });
};
