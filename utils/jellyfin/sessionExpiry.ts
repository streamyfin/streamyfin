import { isAxiosError } from "axios";

/** Quick Connect's routes, which answer 401 for a reason of their own. */
const QUICK_CONNECT_PATH = /\/quickconnect\//i;

/**
 * Whether a failed request means the server no longer accepts this session.
 *
 * Any 401 does, except one from Quick Connect: Jellyfin answers an approval
 * with a 401 while Quick Connect is turned off, and the token still works
 * everywhere else.
 */
export const endsSession = (error: unknown): boolean =>
  isAxiosError(error) &&
  error.response?.status === 401 &&
  !QUICK_CONNECT_PATH.test(error.config?.url ?? "");
