import { SEERR_REPORT_THROTTLE_MS } from "@/constants/Sentry";
import { markErrorReported, markExpectedError } from "@/utils/errors";

/**
 * Whether a Seerr answer is one it gives in the normal course of business,
 * not a defect:
 * - 401/403: an expired cookie or an action the user may not take; the
 *   session heals through auto-login and the request flow says the rest.
 * - /ratings 404/500: no Rotten Tomatoes entry for the title (404) or its
 *   ratings upstream failed (500) — the badge simply doesn't render.
 * - /user/jellyfin/:id 404: Seerr servers predating the route (seerr#2074);
 *   the caller falls back to password login.
 * - /auth/jellyfin/quickconnect/initiate 404: Seerr predating 3.4.0; the
 *   caller falls back to the key or the password.
 * - POST /request 400: request validation (already requested, no seasons
 *   selected) — the request flow surfaces it to the user.
 */
export const isExpectedSeerrResponse = (
  status: number | undefined,
  method: string | undefined,
  path: string | undefined,
): boolean => {
  if (status === 401 || status === 403) return true;
  if (path?.endsWith("/ratings") && (status === 404 || status === 500))
    return true;
  if (status === 404 && path?.includes("/user/jellyfin")) return true;
  if (status === 404 && path?.endsWith("/auth/jellyfin/quickconnect/initiate"))
    return true;
  if (
    status === 400 &&
    method?.toUpperCase() === "POST" &&
    path?.endsWith("/request")
  )
    return true;
  return false;
};

// The response interceptor fires once per axios attempt, and React Query
// retries a failing request up to 3× — without a throttle one user-visible
// failure is logged several times over.
const recentSeerrReports = new Map<string, number>();

interface SeerrFailure {
  response?: { status?: number };
  config?: { method?: string; url?: string };
}

/**
 * Settles, for one failed Seerr response, who reports it, and marks the
 * error accordingly, because the error goes on from the interceptor into
 * React Query, whose own handler (utils/reportDataError.ts) reports whatever
 * reaches it unmarked:
 * - an expected answer is marked expected, and nobody reports it
 * - a repeat of a failure handed to `report` less than
 *   SEERR_REPORT_THROTTLE_MS ago (a retry is a new error object for the same
 *   failure) is marked reported: its twin was already dealt with
 * - anything else goes to `report`, which is expected to mark it
 *
 * Leaving the first two unmarked is what made a missing rating an issue, and
 * every other Seerr failure two.
 */
export const settleSeerrFailure = <T extends SeerrFailure>(
  error: T,
  report: (error: T) => void,
  now: number = Date.now(),
): void => {
  const status = error.response?.status;
  const method = error.config?.method;
  const path = error.config?.url?.split("?")[0];
  if (isExpectedSeerrResponse(status, method, path)) {
    markExpectedError(error);
    return;
  }
  const key = `${status}|${path}`;
  const last = recentSeerrReports.get(key);
  if (last !== undefined && now - last < SEERR_REPORT_THROTTLE_MS) {
    markErrorReported(error);
    return;
  }
  recentSeerrReports.set(key, now);
  report(error);
};
