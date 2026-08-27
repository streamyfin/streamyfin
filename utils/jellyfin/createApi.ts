import type { Api, Jellyfin } from "@jellyfin/sdk";
import axios from "axios";
import { getJellyfinHeaders } from "@/utils/customHeaders";

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
 * server URL probes as well, and neither interceptor was ever ejected so both
 * piled up again on every login and server switch.
 *
 * An instance of its own settles all three at the source. It also means every
 * request seen here is by construction a request to `serverUrl`, so the headers
 * do not need the `getJellyfinHeadersForUrl` guard the rest of the app uses:
 * that guard is for shared paths, and adding it to a private instance would
 * only invent a way to drop the headers on a relative URL.
 */
export function createApiWithCustomHeaders(
  jellyfin: Jellyfin,
  serverUrl: string,
  accessToken?: string,
): Api {
  const api = jellyfin.createApi(serverUrl, accessToken, axios.create());

  api.axiosInstance.interceptors.request.use((config) => {
    for (const [key, value] of Object.entries(getJellyfinHeaders(serverUrl))) {
      config.headers.set(key, value);
    }
    return config;
  });

  return api;
}
