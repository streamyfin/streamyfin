import { isHttpUrl } from "@/utils/serverUrl/candidates";

/**
 * Builds the Jellyfin WebSocket URL.
 *
 * @returns null when `basePath` is not an http(s) URL. The socket only carries
 * live updates, and its caller is an effect near the root of the provider
 * tree: throwing here takes the whole app down at launch, where returning
 * nothing costs the updates and leaves the app usable enough to correct the
 * address.
 */
export const getWebSocketUrl = (
  basePath: string,
  accessToken: string,
  deviceId: string,
): string | null => {
  if (!isHttpUrl(basePath)) return null;

  const url = new URL(basePath);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/socket`;
  url.searchParams.set("ApiKey", accessToken);
  url.searchParams.set("deviceId", deviceId);
  return url.toString();
};
