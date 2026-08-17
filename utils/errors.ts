import { isAxiosError, isCancel } from "axios";

/**
 * Marks errors that are user-facing outcomes rather than app defects — a
 * wrong password, a denied permission — so the global React Query error
 * reporting in app/_layout.tsx doesn't send them to Sentry. The underlying
 * technical failure should already have been logged (writeErrorLog /
 * logAndCaptureError) before the marked error is thrown for the UI.
 */
const EXPECTED_ERROR = Symbol.for("streamyfin.expectedError");

export const markExpectedError = <T>(error: T): T => {
  if (error !== null && typeof error === "object") {
    (error as Record<symbol, unknown>)[EXPECTED_ERROR] = true;
  }
  return error;
};

/**
 * Marks errors that have already been sent to Sentry (by logAndCaptureError)
 * so the global React Query handler doesn't report them a second time when
 * they're rethrown into a query/mutation.
 */
const REPORTED_ERROR = Symbol.for("streamyfin.reportedError");

export const markErrorReported = <T>(error: T): T => {
  if (error !== null && typeof error === "object") {
    (error as Record<symbol, unknown>)[REPORTED_ERROR] = true;
  }
  return error;
};

export const isErrorReported = (error: unknown): boolean =>
  error !== null &&
  typeof error === "object" &&
  (error as Record<symbol, unknown>)[REPORTED_ERROR] === true;

/** True for cancelled/aborted requests (navigation away, new keystroke) —
 * routine control flow that should never be reported as a failure. */
export const isAbortLikeError = (error: unknown): boolean =>
  isCancel(error) ||
  (error instanceof Error &&
    (error.name === "AbortError" || error.name === "CanceledError"));

/**
 * True for requests that never got an HTTP response — the server is
 * unreachable (LAN-only server while roaming, DNS failure, timeout). That is
 * the user's environment, not an app bug, so it must never become a Sentry
 * event. Covers both axios errors and React Native's fetch TypeError.
 */
export const isConnectivityError = (error: unknown): boolean => {
  if (isAxiosError(error)) return !error.response;
  return (
    error instanceof TypeError && /network request failed/i.test(error.message)
  );
};

export const isExpectedError = (error: unknown): boolean =>
  error !== null &&
  typeof error === "object" &&
  (error as Record<symbol, unknown>)[EXPECTED_ERROR] === true;
