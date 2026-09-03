import type { Api, Jellyfin } from "@jellyfin/sdk";
import axios, { type InternalAxiosRequestConfig } from "axios";
import { getJellyfinHeaders, isUrlForBaseUrl } from "@/utils/customHeaders";

/**
 * Whether a request URL carries its own origin, and so ignores whatever base
 * the request was given. Covers the protocol-relative form axios also treats
 * as absolute.
 */
const isAbsoluteUrl = (url: string): boolean =>
  /^([a-z][a-z0-9+.-]*:)?\/\//i.test(url);

/** Whether a request is bound for `serverUrl`, and may carry its credentials. */
const isForServer = (
  config: InternalAxiosRequestConfig,
  serverUrl: string,
): boolean => {
  const url = config.url ?? "";
  if (isAbsoluteUrl(url)) return isUrlForBaseUrl(url, serverUrl);

  // A relative url lands wherever the request's own base points, and a caller
  // sets that per request — so it is not safe by being relative. With no base
  // at all there is nothing to check it against, and an unverifiable
  // destination does not get the credentials. Every caller in the app builds
  // its url from `api.basePath`, so nothing real takes this branch.
  return !!config.baseURL && isUrlForBaseUrl(config.baseURL, serverUrl);
};

/**
 * Creates a Jellyfin `Api` whose every request carries the custom proxy auth
 * headers configured for that server (Cloudflare Access, Pangolin, ...).
 *
 * The interceptor belongs here rather than in a provider effect: `apiAtom`
 * starts out holding a live `Api`, and child effects run before parent effects,
 * so the first queries of a cold start would fire before an effect-installed
 * interceptor existed and be rejected by the gateway.
 *
 * Headers are read per request (they are memoized until the configuration
 * changes), so an edit in settings applies without recreating the `Api`.
 *
 * ## Why the axios instance is passed in
 *
 * `createApi` defaults to the global axios instance, so everything attached to
 * `api.axiosInstance` used to watch every bare `axios` call in the app rather
 * than the Jellyfin ones. Three things came out of that: a 401 from a
 * Streamystats server reached the session-expiry interceptor and signed the
 * user out of Jellyfin, the headers below went out to Streamystats and to the
 * server URL probes as well, and the request interceptor added here was never
 * ejected, so it piled up again on every login and server switch. (The
 * session-expiry interceptor in `JellyfinProvider` is ejected by its effect
 * cleanup; only this one leaked.)
 *
 * An instance of its own settles all three.
 *
 * ## Why the headers are still guarded
 *
 * A private instance narrows who can reach this interceptor; it does not make
 * every request a request to `serverUrl`. `api.axiosInstance` is public, and
 * callers do hand it absolute URLs: the sessions screen used it for a geo-IP
 * lookup and sent the gateway credentials to a third party for over a year.
 *
 * The SDK builds an absolute URL for every request of its own — it prepends
 * `basePath` whenever the instance has no `baseURL`, and this one is created
 * without any — so that is the shape real traffic takes and the guard runs on
 * all of it. A caller can still pass a relative url with a `baseURL` of its
 * own, which is why both are read rather than either being trusted.
 */
export function createApiWithCustomHeaders(
  jellyfin: Jellyfin,
  serverUrl: string,
  accessToken?: string,
): Api {
  const api = jellyfin.createApi(serverUrl, accessToken, axios.create());

  api.axiosInstance.interceptors.request.use((config) => {
    if (!isForServer(config, serverUrl)) return config;

    for (const [key, value] of Object.entries(getJellyfinHeaders(serverUrl))) {
      config.headers.set(key, value);
    }
    return config;
  });

  return api;
}
