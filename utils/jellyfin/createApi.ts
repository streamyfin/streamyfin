import type { Api, Jellyfin } from "@jellyfin/sdk";
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
 */
export function createApiWithCustomHeaders(
  jellyfin: Jellyfin,
  serverUrl: string,
  accessToken?: string,
): Api {
  const api = jellyfin.createApi(serverUrl, accessToken);

  api.axiosInstance.interceptors.request.use((config) => {
    for (const [key, value] of Object.entries(getJellyfinHeaders(serverUrl))) {
      config.headers.set(key, value);
    }
    return config;
  });

  return api;
}
