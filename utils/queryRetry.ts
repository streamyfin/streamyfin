import { onlineManager } from "@tanstack/react-query";
import { MAX_QUERY_RETRIES } from "@/constants/Query";
import { isStaleIdError } from "@/utils/errors";

/**
 * The `retry` of the app's queries (app/_layout.tsx): whether a query that
 * failed is tried again, `failureCount` being how many times it already was.
 * Up to MAX_QUERY_RETRIES, except:
 * - offline, where the next attempt cannot reach the server either
 * - for an id the server no longer has (isStaleIdError), which it answers the
 *   same way every time: the retries would only hold the error back
 */
export const shouldRetryQuery = (
  failureCount: number,
  error: unknown,
): boolean => {
  if (!onlineManager.isOnline()) return false;
  if (isStaleIdError(error)) return false;
  return failureCount < MAX_QUERY_RETRIES;
};
