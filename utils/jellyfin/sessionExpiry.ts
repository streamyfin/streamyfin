import { isAxiosError } from "axios";

/**
 * Quick Connect's routes, at the end of the path: a server's base path can
 * carry any name, Quick Connect's included.
 */
const QUICK_CONNECT_ROUTE =
  /\/quickconnect\/(?:enabled|initiate|connect|authorize)\/?$/i;

/** The path of a request URL, without its query or fragment. */
const pathOf = (url: string) => url.split(/[?#]/)[0];

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
  !QUICK_CONNECT_ROUTE.test(pathOf(error.config?.url ?? ""));
