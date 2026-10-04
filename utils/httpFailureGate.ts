import { isAxiosError } from "axios";
import {
  HTTP_FAILURE_STORM_WINDOW_MS,
  MAX_SESSION_REPORT_KEYS,
} from "@/constants/Sentry";
import { describeHttpError } from "@/utils/errors";

/**
 * Whether a failed HTTP request becomes a Sentry event:
 * - "report": the first of its kind, send it
 * - "duplicate": this route already failed with this status in this session
 * - "storm": another route of the same backend failed with this status a
 *   moment ago, and this one is taken to be the same incident
 */
export type HttpFailureVerdict = "report" | "duplicate" | "storm";

// One event per (backend, route, status) per session, whichever call site
// sees the failure first. A failing endpoint is hit again by every keystroke
// in search, by every screen that mounts the same request, and by each layer
// that handles the same playback (the native player fails to build its
// config, the JS player then fails on the very same request): the repeat
// says nothing the first did not, and filed under another message it opens a
// second issue for one failure.
const reported = new Set<string>();

// The latest reported failure per (backend, status), which is what the next
// failures are compared with.
const storms = new Map<string, { route: string; at: number }>();

const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i;

// Which server the request went to. Kept in memory to tell backends apart
// and never attached to an event: it is the user's private server address.
const requestOrigin = (error: unknown): string => {
  if (!isAxiosError(error)) return "?";
  const match =
    ORIGIN.exec(error.config?.url ?? "") ??
    ORIGIN.exec(error.config?.baseURL ?? "");
  return match ? match[0].toLowerCase() : "?";
};

/**
 * Decides whether a failed request is reported, and remembers it when it is.
 * Anything that is not an HTTP response is "report": this gate only knows
 * routes and statuses.
 *
 * The storm rule: one server having a bad minute fails every request in
 * flight with the same status (a 500 from a broken database, a 403 from a
 * gateway), and each route would open its own issue. So once a status is
 * reported for a backend, other routes failing with that status within
 * HTTP_FAILURE_STORM_WINDOW_MS are not sent.
 *
 * The window is fixed from the reported failure and is not extended by what
 * it silences, so a server that stays broken reports again, on whichever
 * route fails first, once it has passed. A silenced failure is not
 * remembered either: if that route still fails after the window, it is
 * reported then.
 *
 * What this gives up: a route with a bug of its own stays quiet in a session
 * where another route of the same server failed with the same status less
 * than a window before. A route that fails on its own, which is what an app
 * bug looks like for every other user, is always the first and always
 * reported.
 */
export const admitHttpFailure = (
  error: unknown,
  now: number = Date.now(),
): HttpFailureVerdict => {
  const http = describeHttpError(error);
  if (!http) return "report";

  const origin = requestOrigin(error);
  const route = `${http.method} ${http.path}`;
  const key = `${origin}|${route}|${http.status}`;
  if (reported.has(key)) return "duplicate";

  const stormKey = `${origin}|${http.status}`;
  const storm = storms.get(stormKey);
  if (
    storm &&
    storm.route !== route &&
    now - storm.at < HTTP_FAILURE_STORM_WINDOW_MS
  ) {
    return "storm";
  }

  if (reported.size < MAX_SESSION_REPORT_KEYS) reported.add(key);
  storms.set(stormKey, { route, at: now });
  return "report";
};
